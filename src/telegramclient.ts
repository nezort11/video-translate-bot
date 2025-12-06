import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import fs from "fs";
import axios from "axios";
import { importPTimeout } from "./utils";
import { diff, duration } from "./time";
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
import { cleanupOldChannelMessages, uploadVideo } from "./core";
import { RPCError } from "telegram/errors";

export class CorruptedSessionStringError extends Error {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args);
    this.name = this.constructor.name;
  }
}

export class TelegramDownloadTimeoutError extends Error {
  constructor(message?: string) {
    super(
      message ||
        "Telegram download timeout: The file took too long to download from Telegram servers"
    );
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
  const availableSessionIndices: number[] = [];

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
      diff.inSeconds(new Date(), new Date(lastConnectedAt)) < EXECUTION_TIMEOUT
    ) {
      continue;
    } else {
      availableSessionIndices.push(sessionIndex);
    }
  }

  if (availableSessionIndices.length === 0) {
    throw new NoOpenTelegramSessionError(
      "No open telegram sessions available at the moment!"
    );
  }

  const randomSessionIndex = Math.floor(
    Math.random() * availableSessionIndices.length
  );
  return availableSessionIndices[randomSessionIndex];
};

export const getClient = async (sessionString: string) => {
  const session = new StringSession(sessionString);
  const _telegramClient = new TelegramClient(session, +API_ID, APP_HASH, {
    connectionRetries: 3,
    // Increase timeout from default 10s to 10 minutes for large file downloads
    // Default 10s causes "Request timeout 10000ms exceeded" errors
    timeout: 600000, // 10 minutes in milliseconds
    requestRetries: 3,
  });

  const isLoggedIn = await _telegramClient.isUserAuthorized();
  if (!isLoggedIn) {
    await new Promise<void>(async (resolve, reject) => {
      const rejectOnSessionExpire = async () => {
        reject(
          new CorruptedSessionStringError(
            "Telegram client session has expired!"
          )
        );
        // Set mock credentials and etc. (will produce exception instead of halting) in case session is expired
        return "";
      };

      try {
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
  console.log(
    "telegram sessions store",
    JSON.stringify(telegramSessionsStore, null, 0)
  );

  let sessionStringIndex: number;
  let client: undefined | TelegramClient;
  do {
    sessionStringIndex = await getAvailableSessionStringIndex(
      telegramSessionsStore
    );
    console.log("available telegram session index:", sessionStringIndex);
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
  const forwardedFileMessage = await bot.telegram.copyMessage(
    STORAGE_CHANNEL_CHAT_ID,
    chatId,
    messageId,
    {
      caption: "",
    }
  );
  const [fileMessage] = await telegramClient.getMessages(
    STORAGE_CHANNEL_CHAT_ID,
    {
      ids: [forwardedFileMessage.message_id],
    }
  );

  if (!fileMessage) {
    throw new Error("File message not found in channel");
  }

  try {
    const fileBuffer = (await fileMessage.downloadMedia({
      outputFile: undefined,
    })) as Buffer;

    return fileBuffer;
  } finally {
    try {
      await fileMessage.delete({ revoke: true });
    } catch (error) {
      console.warn("Failed to delete file message", error);
    }
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

  const channelFileMessage = await bot.telegram.copyMessage(
    STORAGE_CHANNEL_CHAT_ID,
    chatId,
    messageId,
    {
      caption: "",
    }
  );

  const videoChannelMessageUrl = new URL(
    `tg://video/${channelFileMessage.message_id}`
  );
  try {
    console.log("downloading video using worker api...");
    const { default: pTimeout } = await importPTimeout();
    const downloadTimeoutMilliseconds = duration.seconds(
      EXECUTION_TIMEOUT - 60
    );

    let videoFileUrl: string;
    if (APP_ENV === "local") {
      const videoBuffer = await downloadMessageFile(
        channelFileMessage.message_id
      );
      videoFileUrl = await uploadVideo(videoBuffer);
    } else {
      // Normalize baseURL to avoid double slashes in URL path
      // Remove trailing slash from baseURL if present
      const normalizedBaseURL = WORKER_APP_SERVER_URL.replace(/\/$/, "");

      try {
        const videoResponse = await pTimeout(
          axios.post("/download", null, {
            params: {
              url: videoChannelMessageUrl.href,
            },
            baseURL: normalizedBaseURL,
            // Add axios timeout that's slightly less than pTimeout
            timeout: downloadTimeoutMilliseconds - 5000,
          }),
          {
            milliseconds: downloadTimeoutMilliseconds,
          }
        );
        videoFileUrl = videoResponse.data.url;
      } catch (error) {
        // Enhance error message for worker download failures
        if (axios.isAxiosError(error) && error.response?.status === 500) {
          const errorData = error.response.data;
          if (
            errorData?.message?.includes("Timeout") ||
            errorData?.errorMessage?.includes("Timeout")
          ) {
            throw new TelegramDownloadTimeoutError();
          }
        }
        throw error;
      }
    }

    console.log("Downloaded video:", videoFileUrl);
    return videoFileUrl;
  } finally {
    console.log("Deleting forwarded video message...");
    await useTelegramClient(async (telegramClient) => {
      const [fileMessage] = await telegramClient.getMessages(
        STORAGE_CHANNEL_CHAT_ID,
        {
          ids: [channelFileMessage.message_id],
        }
      );
      // Deleting original user message for copyright/privacy reasons
      if (fileMessage) {
        try {
          await fileMessage.delete({ revoke: true });
          console.log("Deleted forwarded video message");
        } catch (error) {
          console.warn("Failed to delete forwarded video message", error);
        }
      } else {
        console.warn(
          "Forwarded video message not found, might be already deleted"
        );
      }

      // Cleanup: delete old messages in the storage channel
      console.log("Cleaning up old storage channel messages...");
      try {
        await cleanupOldChannelMessages(
          telegramClient,
          STORAGE_CHANNEL_CHAT_ID
        );
        console.log("Cleaned up messages older than 1 hour in storage channel");
      } catch (error) {
        console.warn("Failed to cleanup old storage channel messages", error);
      }

      await telegramClient.disconnect();
    });
  }
};

/**
 * Downloads a file from Telegram with retry logic for timeout errors
 */
export const downloadMessageFile = async (
  messageId: number,
  maxRetries: number = 3
) => {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Downloading file (attempt ${attempt}/${maxRetries})...`);

      let fileBuffer: Buffer;
      await useTelegramClient(async (telegramClient) => {
        const [fileMessage] = await telegramClient.getMessages(
          STORAGE_CHANNEL_CHAT_ID,
          {
            ids: [messageId],
          }
        );

        if (!fileMessage) {
          throw new Error(`Message with ID ${messageId} not found in channel`);
        }

        fileBuffer = (await fileMessage.downloadMedia({
          outputFile: undefined,
        })) as Buffer;
      });

      console.log(`File downloaded successfully on attempt ${attempt}`);
      return fileBuffer!;
    } catch (error) {
      lastError = error as Error;

      // Check if this is a retriable Telegram timeout error
      const isTimeoutError =
        error instanceof RPCError &&
        (error.message.includes("Timeout") || error.message.includes("-503"));

      // Check if this is a retriable network error
      const isNetworkError =
        error instanceof Error &&
        (error.message.includes("ETIMEDOUT") ||
          error.message.includes("ECONNRESET") ||
          error.message.includes("Request timeout"));

      if ((isTimeoutError || isNetworkError) && attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s
        const delaySeconds = Math.pow(2, attempt);
        console.warn(
          `Download failed with ${
            isTimeoutError ? "Telegram timeout" : "network error"
          }: ${error.message}`
        );
        console.log(`Retrying in ${delaySeconds}s...`);
        await new Promise((resolve) =>
          setTimeout(resolve, delaySeconds * 1000)
        );
      } else {
        // Non-retriable error or max retries reached
        if (isTimeoutError && attempt >= maxRetries) {
          // Convert to our custom error after exhausting retries
          throw new TelegramDownloadTimeoutError(
            `Failed to download file after ${maxRetries} attempts due to Telegram timeout`
          );
        }
        throw error;
      }
    }
  }

  // Should not reach here, but throw custom error if we do
  throw new TelegramDownloadTimeoutError(
    lastError?.message || "Download failed after retries"
  );
};
