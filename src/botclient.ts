import { Telegraf } from "telegraf";

import { TelegramError } from "telegraf";
import { type Update } from "telegraf/types";
import { type UpdateType } from "telegraf/typings/telegram-types";
import ApiClient from "telegraf/typings/core/network/client";
import AbortController from "abort-controller";
import storage from "node-persist";
import d from "debug";
import { promisify } from "util";

const debug = d("telegraf:polling");
const wait = promisify(setTimeout);
function always<T>(x: T) {
  return () => x;
}
const noop = always(Promise.resolve());

export class BotPolling {
  protected readonly abortController = new AbortController();
  protected skipOffsetSync = false;
  protected offset = 0;
  constructor(
    protected readonly telegram: ApiClient,
    protected readonly allowedUpdates: readonly UpdateType[]
  ) {}

  protected async *[Symbol.asyncIterator]() {
    debug("Starting long polling");
    do {
      try {
        let offset = (await storage.getItem("offset")) ?? 0;
        let updateHandleCount =
          (await storage.getItem("updateHandleCount")) ?? 0;
        // Try to process update 3 times than drop
        if (updateHandleCount >= 3) {
          offset += 1;
          updateHandleCount = 0;
          await storage.setItem("offset", offset);
          await storage.setItem("updateHandleCount", 0);
        }

        const updates = await this.telegram.callApi(
          "getUpdates",
          {
            timeout: 50,
            offset,
            allowed_updates: this.allowedUpdates,
          },
          this.abortController
        );

        if (updates.length > 0) {
          await storage.setItem("updateHandleCount", updateHandleCount + 1);
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
    const offset = await storage.getItem("offset");
    await this.telegram.callApi("getUpdates", {
      offset: offset ?? 0,
      limit: 1,
    });
  }

  async loop(handleUpdate: (updates: Update) => Promise<void>) {
    if (this.abortController.signal.aborted)
      throw new Error("Polling instances must not be reused!");
    try {
      for await (const updates of this) {
        for (const update of updates) {
          try {
            await handleUpdate(update);
          } finally {
            await storage.setItem("offset", update.update_id + 1);
            await storage.setItem("updateHandleCount", 0);
          }
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

// @ts-expect-error private members can be overridden
export class BotTelegraf extends Telegraf {
  private polling?: BotPolling;

  private startPolling(allowedUpdates: UpdateType[] = []) {
    this.polling = new BotPolling(this.telegram, allowedUpdates);
    return this.polling.loop(async (update) => {
      await this.handleUpdate(update);
    });
  }
}
