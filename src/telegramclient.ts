import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import fs from "fs";
import axios from "axios";
import { importPTimeout } from "./utils";
import moment from "moment";
// // // @ts-expect-error no types
// import input from "input";
import {
  API_ID,
  APP_ENV,
  APP_HASH,
  DOTENV_DIR_PATH,
  EXECUTION_TIMEOUT,
  STORAGE_CHANNEL_CHAT_ID,
  WORKER_APP_SERVER_URL,
} from "./env";
import { bot } from "./botinstance";
import { store } from "./db";
import path from "path";
import { uploadVideo } from "./core";
import { RPCError } from "telegram/errors";

export class CorruptedSessionStringError extends Error {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args);
    this.name = this.constructor.name;
  }
}

export class NoOpenTelegramSessionError extends Error {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args);
    this.name = this.constructor.name;
  }
}

const TELEGRAM_SESSIONS_KEY_NAME = "telegram_sessions";
const TELEGRAM_SESSIONS_FILENAME = `${TELEGRAM_SESSIONS_KEY_NAME}.json`;
// cookies.json file path relative to this file
const TELEGRAM_SESSIONS_FILE_PATH = path.join(
  DOTENV_DIR_PATH,
  TELEGRAM_SESSIONS_FILENAME
);
const telegramSessionStrings = JSON.parse(
  fs.readFileSync(TELEGRAM_SESSIONS_FILE_PATH, "utf-8")
) as Array<string>;

export type TelegramSessionsStore = {
  [sessionsIndex: string]: {
    lastConnectedAt?: string; // ISO 8601
    isInvalid?: boolean;
  };
};

// Telegram session "load-balancing" system
const getAvailableSessionStringIndex = async (
  telegramSessionsStore: TelegramSessionsStore
) => {
  for (
    let sessionIndex = 0;
    sessionIndex < telegramSessionStrings.length;
    sessionIndex++
  ) {
    const telegramSessionInfo = telegramSessionsStore[sessionIndex];
    const isInvalid = telegramSessionInfo?.isInvalid;
    const lastConnectedAt = telegramSessionInfo?.lastConnectedAt;

    if (isInvalid) {
      continue;
    } else if (
      lastConnectedAt &&
      moment().diff(lastConnectedAt, "seconds") < EXECUTION_TIMEOUT
    ) {
      continue;
    } else {
      return sessionIndex;
    }
  }

  throw new NoOpenTelegramSessionError(
    "No open telegram sessions available at the moment!"
  );
};

export const getClient = async (sessionString: string) => {
  const session = new StringSession(sessionString);
  const _telegramClient = new TelegramClient(session, +API_ID, APP_HASH, {
    connectionRetries: 3,
  });

  const isLoggedIn = await _telegramClient.isUserAuthorized();
  if (!isLoggedIn) {
    await new Promise<void>(async (resolve, reject) => {
      try {
        const rejectOnSessionExpire = async () => {
          reject(
            new CorruptedSessionStringError(
              "Telegram client session has expired!"
            )
          );
          // Set mock credentials and etc. (will produce exception instead of halting) in case session is expired
          return "";
        };

        await _telegramClient.start({
          phoneNumber: rejectOnSessionExpire,
          password: rejectOnSessionExpire,
          phoneCode: rejectOnSessionExpire,
          // phoneNumber: async () => await input.text("Please enter your number: "),
          // password: async () => await input.text("Please enter your password: "),
          // phoneCode: async () =>
          //   await input.text("Please enter the code you received: "),
          onError: (error) => console.error(error),
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Test some client method to check ahead for RPCError: 406: AUTH_KEY_DUPLICATED
  try {
    await _telegramClient.getMe();
  } catch (error) {
    await _telegramClient.disconnect();
    if (error instanceof RPCError) {
      throw new CorruptedSessionStringError(
        "Telegram client session has been corrupted!",
        { cause: error }
      );
    } else {
      throw error;
    }
  }

  return _telegramClient;
};

type TelegramClientHandler = (client: TelegramClient) => Promise<void>;

export const useTelegramClient = async (handler: TelegramClientHandler) => {
  let telegramSessionsStore: TelegramSessionsStore =
    (await store.get(TELEGRAM_SESSIONS_KEY_NAME)) ?? {};
  console.log("telegram sessions store", telegramSessionsStore);

  let sessionStringIndex: number;
  let client: undefined | TelegramClient;
  do {
    sessionStringIndex = await getAvailableSessionStringIndex(
      telegramSessionsStore
    );
    console.log("available telegram session index", sessionStringIndex);
    const sessionString = telegramSessionStrings[sessionStringIndex];
    telegramSessionsStore[sessionStringIndex] ??= {};

    try {
      client = await getClient(sessionString);
    } catch (error) {
      if (error instanceof CorruptedSessionStringError) {
        console.log("session string is corrupted", sessionStringIndex);
        telegramSessionsStore[sessionStringIndex].isInvalid = true;
        await store.set(TELEGRAM_SESSIONS_KEY_NAME, telegramSessionsStore);
      } else {
        throw error;
      }
    }
  } while (!client);

  try {
    telegramSessionsStore[sessionStringIndex].lastConnectedAt =
      new Date().toISOString();
    await store.set(TELEGRAM_SESSIONS_KEY_NAME, telegramSessionsStore);
    console.log(
      "available session store item",
      telegramSessionsStore[sessionStringIndex]
    );

    return await handler(client);
  } finally {
    await client.disconnect();

    telegramSessionsStore = (await store.get(TELEGRAM_SESSIONS_KEY_NAME)) ?? {};
    delete telegramSessionsStore[sessionStringIndex].lastConnectedAt;
    console.log(
      "available session store item",
      telegramSessionsStore[sessionStringIndex]
    );
    await store.set(TELEGRAM_SESSIONS_KEY_NAME, telegramSessionsStore);
  }
};

export const downloadLargeFile = async (chatId: number, messageId: number) => {
  const telegramClient = await getClient("");
  const forwardedFileMessage = await bot.telegram.forwardMessage(
    STORAGE_CHANNEL_CHAT_ID,
    chatId,
    messageId
  );
  const [fileMessage] = await telegramClient.getMessages(
    STORAGE_CHANNEL_CHAT_ID,
    {
      ids: [forwardedFileMessage.message_id],
    }
  );
  try {
    const fileBuffer = (await fileMessage.downloadMedia({
      outputFile: undefined,
    })) as Buffer;

    return fileBuffer;
  } finally {
    await fileMessage.delete({ revoke: true });
  }
  // } finally {
  // bot cannot delete messages in channel
  // await bot.telegram.deleteMessage(chatId, forwardedFileMessage.message_id);
  // }
};

export const delegateDownloadLargeFile = async (
  chatId: number,
  messageId: number
) => {
  // 1. Check telegram client before forwarding message
  // 2. Disconnect to prevent 406: AUTH_KEY_DUPLICATED
  await useTelegramClient(async () => {
    console.log("Available valid telegram client exists!");
  });

  const channelFileMessage = await bot.telegram.forwardMessage(
    STORAGE_CHANNEL_CHAT_ID,
    chatId,
    messageId
  );

  const videoChannelMessageUrl = new URL(
    `tg://video/${channelFileMessage.message_id}`
  );
  try {
    console.log("downloading video using worker api...");
    const { default: pTimeout } = await importPTimeout();
    const downloadTimeoutMilliseconds = moment
      .duration(EXECUTION_TIMEOUT - 60, "seconds")
      .asMilliseconds();

    let videoFileUrl: string;
    if (APP_ENV === "local") {
      const videoBuffer = await downloadMessageFile(
        channelFileMessage.message_id
      );
      videoFileUrl = await uploadVideo(videoBuffer);
    } else {
      const videoResponse = await pTimeout(
        axios.post("/download", null, {
          params: {
            url: videoChannelMessageUrl.href,
          },
          baseURL: WORKER_APP_SERVER_URL,
        }),
        {
          milliseconds: downloadTimeoutMilliseconds,
        }
      );
      videoFileUrl = videoResponse.data.url;
    }

    console.log("successfully downloaded video", videoFileUrl);
    return videoFileUrl;
  } finally {
    console.log("deleting forwarded video message");
    await useTelegramClient(async (telegramClient) => {
      const [fileMessage] = await telegramClient.getMessages(
        STORAGE_CHANNEL_CHAT_ID,
        {
          ids: [channelFileMessage.message_id],
        }
      );
      await fileMessage.delete({ revoke: true });
      await telegramClient.disconnect();
    });
  }
};

export const downloadMessageFile = async (messageId: number) => {
  let fileBuffer: Buffer;
  await useTelegramClient(async (telegramClient) => {
    const [fileMessage] = await telegramClient.getMessages(
      STORAGE_CHANNEL_CHAT_ID,
      {
        ids: [messageId],
      }
    );
    fileBuffer = (await fileMessage.downloadMedia({
      outputFile: undefined,
    })) as Buffer;
  });
  return fileBuffer!;
};
