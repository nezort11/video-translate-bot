import { Telegraf, TelegramError } from "telegraf";
import ApiClient from "telegraf/typings/core/network/client";
import { type Update } from "telegraf/types";
import { type UpdateType } from "telegraf/typings/telegram-types";
import AbortController from "abort-controller";
import storage from "node-persist";
import d from "debug";
import { promisify } from "util";
import { ServerResponse } from "http";

import { telegramLoggerContext } from "./telegramlogger";

const debug = d("telegraf:polling");
const wait = promisify(setTimeout);
function always<T>(x: T) {
  return () => x;
}
const noop = always(Promise.resolve());

// start storage offset (used between server restarts)
const getStartOffset = async () => {
  const startOffset = (await storage.getItem("startOffset")) as
    | number
    | undefined;
  return startOffset ?? 0;
};

const setStartOffset = async (newStartOffset: number) => {
  return await storage.setItem("startOffset", newStartOffset);
};

const getEndOffset = async () => {
  const endOffset = (await storage.getItem("endOffset")) as number | undefined;
  return endOffset ?? 0;
};

const setEndOffset = async (newEndOffset: number) => {
  return await storage.setItem("endOffset", newEndOffset);
};

export class BotPolling {
  protected readonly abortController = new AbortController();
  protected skipOffsetSync = false;
  protected startOffset: number | undefined = undefined;
  // local offset (used between get updates)
  // 0 - long poll new updates
  protected offset: number = 0;
  constructor(
    protected readonly telegram: ApiClient,
    protected readonly allowedUpdates: readonly UpdateType[]
  ) {}

  protected async *[Symbol.asyncIterator]() {
    debug("Starting long polling");
    do {
      try {
        const updates = await this.telegram.callApi(
          "getUpdates",
          {
            timeout: 50,
            offset: this.offset,
            allowed_updates: this.allowedUpdates,
          },
          this.abortController
        );

        const first = updates[0];
        if (first !== undefined) {
          this.startOffset ??= await getStartOffset();
          if (this.startOffset === 0) {
            await setStartOffset(first.update_id);
          }
        }
        const last = updates[updates.length - 1];
        if (last !== undefined) {
          this.offset = last.update_id + 1;
          await setEndOffset(last.update_id);
        }

        yield updates;
      } catch (error) {
        const err = error as Error & {
          parameters?: { retry_after: number };
        };

        if (err.name === "AbortError") return;
        if (
          err.name === "FetchError" ||
          (err instanceof TelegramError && err.code === 429) ||
          (err instanceof TelegramError && err.code >= 500)
        ) {
          const retryAfter: number = err.parameters?.retry_after ?? 5;
          debug(
            "Failed to fetch updates, retrying after %ds.",
            retryAfter,
            err
          );
          await wait(retryAfter * 1000);
          continue;
        }
        if (
          err instanceof TelegramError &&
          // Unauthorized      Conflict
          (err.code === 401 || err.code === 409)
        ) {
          this.skipOffsetSync = true;
          throw err;
        }
        throw err;
      }
    } while (!this.abortController.signal.aborted);
  }

  protected async syncUpdateOffset() {
    if (this.skipOffsetSync) return;
    debug("Syncing update offset...");
    await this.telegram.callApi("getUpdates", {
      offset: this.offset,
      limit: 1,
    });
  }

  async loop(handleUpdate: (update: Update) => Promise<void>) {
    if (this.abortController.signal.aborted)
      throw new Error("Polling instances must not be reused!");
    try {
      for await (const updates of this) {
        for (const update of updates) {
          // Process updates asynchronously
          handleUpdate(update);
        }
      }
    } finally {
      debug("Long polling stopped");
      // prevent instance reuse
      this.stop();
      await this.syncUpdateOffset().catch(noop);
    }
  }

  stop() {
    this.abortController.abort();
  }
}

type UpdateHandleInfo = {
  handleCount: number;
  update: Update;
};

const setUpdateHandleInfo = async (
  updateId: number,
  updateHandleInfo: UpdateHandleInfo
) => {
  return await storage.setItem(`${updateId}`, updateHandleInfo);
};

const deleteUpdateHandleInfo = async (updateId: number) => {
  return await storage.removeItem(`${updateId}`);
};

// @ts-expect-error private members can be overridden
export class BotTelegraf extends Telegraf {
  private polling?: BotPolling;

  protected async getUpdateHandleInfo(updateId: number) {
    const updateHandleInfo = (await storage.get(`${updateId}`)) as
      | UpdateHandleInfo
      | undefined;
    return updateHandleInfo;
  }

  // https://github.com/telegraf/telegraf/blob/v4/src/telegraf.ts
  async handleUpdate(update: Update, webhookResponse?: ServerResponse) {
    const updateHandleInfo = (await this.getUpdateHandleInfo(
      update.update_id
    )) ?? {
      handleCount: 0,
      update,
    };
    updateHandleInfo.handleCount += 1;
    await setUpdateHandleInfo(update.update_id, updateHandleInfo);

    // Ignore messages from channels
    if (!("channel_post" in update)) {
      await telegramLoggerContext.reply(
        `⏳ Started processing update ${update.update_id}`
      );
    }
    try {
      return await super.handleUpdate(update, webhookResponse);
    } finally {
      // handled update = deleted update
      await deleteUpdateHandleInfo(update.update_id);

      // Ignore messages from channels
      if (!("channel_post" in update)) {
        await telegramLoggerContext.reply(
          `🏁 Finished processing update ${update.update_id}`
        );
      }
    }
  }

  protected async handlePreviousUpdates() {
    const startOffset = await getStartOffset();
    if (startOffset === 0) {
      return;
    }

    const endOffset = await getEndOffset();
    let newsStartOffset: number | undefined = undefined;
    for (let updateId = startOffset; updateId <= endOffset; updateId += 1) {
      const updateHandleInfo = await this.getUpdateHandleInfo(updateId);
      if (updateHandleInfo === undefined) {
        continue;
      } else if (updateHandleInfo.handleCount >= 3) {
        // Try to process update 3 times than drop
        await deleteUpdateHandleInfo(updateId);
      } else {
        // kick off all previous updates asynchronously
        this.handleUpdate(updateHandleInfo.update);
        // save first unhandled update id
        newsStartOffset ??= updateId;
      }
    }

    await setStartOffset(newsStartOffset ?? endOffset + 1);
  }

  protected startPolling(allowedUpdates: UpdateType[] = []) {
    // handle all previous updates saved in storage (sync offset)
    this.handlePreviousUpdates();

    this.polling = new BotPolling(this.telegram, allowedUpdates);
    return this.polling.loop(async (update) => {
      await this.handleUpdate(update);
    });
  }
}
