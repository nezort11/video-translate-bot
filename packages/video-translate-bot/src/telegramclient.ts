import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { ConnectionTCPObfuscated } from "telegram/network";
import fs from "fs";
import axios from "axios";
import { importPRetry, importPTimeout } from "./utils";
import { diff, duration } from "./time";
import { logger } from "./logger";
// // // @ts-expect-error no types
// import input from "input";
import {
  API_ID,
  APP_ENV,
  APP_HASH,
  DOTENV_DIR_PATH,
  EXECUTION_TIMEOUT,
  STORAGE_CHANNEL_CHAT_ID,
  BOT_TOKEN,
  BOT_PUBLIC_USERNAME,
  ALL_PROXY_URIS,
  WORKER_APP_SERVER_URL,
  TELEGRAM_SERVICE_URL,
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

export class AuthKeyDuplicatedError extends Error {
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
    const isAvailable = (lastConnectedAt: string | undefined): boolean => {
      // Sessions should not be locked for more than 5 minutes.
      // Serverless functions typically have a shorter execution time than 30 minutes.
      // If a session is locked for longer, it's likely a leaked lock from a crashed process.
      const MAX_SESSION_LOCK_TIME = 300; // 5 minutes
      return (
        !lastConnectedAt ||
        diff.inSeconds(new Date(), new Date(lastConnectedAt)) >=
          MAX_SESSION_LOCK_TIME
      );
    };

    if (isInvalid) {
      continue;
    } else if (!isAvailable(telegramSessionInfo?.lastConnectedAt)) {
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

const mtprotoProxyRotationIndex = 0;

export const getClient = async (sessionString: string) => {
  const session = new StringSession(sessionString);

  const proxy: any = undefined;
  /*
  if (ALL_PROXY_URIS.length > 0) {
    const proxyUri = ALL_PROXY_URIS[mtprotoProxyRotationIndex];
    mtprotoProxyRotationIndex =
      (mtprotoProxyRotationIndex + 1) % ALL_PROXY_URIS.length;

    try {
      const url = new URL(proxyUri);
      proxy = {
        ip: url.hostname,
        port: parseInt(url.port, 10),
        socksType: url.protocol.replace(":", "") === "socks5" ? 5 : 4,
        username: url.username || undefined,
        password: url.password || undefined,
        timeout: 120,
      };
      logger.info(
        `Using Telegram client proxy (${mtprotoProxyRotationIndex}/${ALL_PROXY_URIS.length}): ${url.protocol}//${url.hostname}:${url.port}`
      );
    } catch (error) {
      logger.error(`Failed to parse proxy URI ${proxyUri}:`, error);
    }
  }
  */

  const _telegramClient = new TelegramClient(session, +API_ID, APP_HASH, {
    connectionRetries: 5,
    connection: ConnectionTCPObfuscated,
    // Increase timeout from default 10s to 10 minutes for large file downloads
    // Default 10s causes "Request timeout 10000ms exceeded" errors
    timeout: 600000, // 10 minutes in milliseconds
    requestRetries: 5,
    proxy,
  });

  const isLoggedIn = await _telegramClient.isUserAuthorized();
  if (!isLoggedIn) {
    const rejectOnSessionExpire = async () => {
      throw new CorruptedSessionStringError(
        "Telegram client session has expired!"
      );
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
        onError: (error) => logger.error(error),
      });
    } catch (error) {
      if (error instanceof CorruptedSessionStringError) {
        throw error;
      }
      throw error;
    }
  }

  // Test some client method to check ahead for RPCError: 406: AUTH_KEY_DUPLICATED
  try {
    await _telegramClient.getMe();
  } catch (error) {
    if (_telegramClient.connected) {
      await _telegramClient.disconnect();
    }
    if (error instanceof RPCError) {
      if (error.code === 406) {
        throw new AuthKeyDuplicatedError(
          "Telegram client session has been duplicated (406: AUTH_KEY_DUPLICATED)!",
          {
            cause: error,
          }
        );
      }
      throw new CorruptedSessionStringError(
        "Telegram client session has been corrupted!",
        {
          cause: error,
        }
      );
    } else {
      throw error;
    }
  }

  return _telegramClient;
};

type TelegramClientHandler<T = void> = (client: TelegramClient) => Promise<T>;

export const useTelegramClient = async <T = void>(
  handler: TelegramClientHandler<T>
) => {
  const { default: pRetry } = await importPRetry();

  const getStoreValue = async () => {
    return await pRetry(() => store!.get(TELEGRAM_SESSIONS_KEY_NAME), {
      retries: 3,
      onFailedAttempt: (error) => {
        logger.warn(
          `Failed to get telegram sessions store (attempt ${error.attemptNumber}): ${error.message}`
        );
      },
    });
  };

  const setStoreValue = async (value: TelegramSessionsStore) => {
    return await pRetry(() => store!.set(TELEGRAM_SESSIONS_KEY_NAME, value), {
      retries: 3,
      onFailedAttempt: (error) => {
        logger.warn(
          `Failed to set telegram sessions store (attempt ${error.attemptNumber}): ${error.message}`
        );
      },
    });
  };

  let telegramSessionsStore: TelegramSessionsStore =
    (await getStoreValue()) ?? {};
  logger.info(
    "telegram sessions store",
    JSON.stringify(telegramSessionsStore, null, 0)
  );

  let sessionStringIndex: number = -1;
  let client: undefined | TelegramClient;
  const triedIndices = new Set<number>();
  const MAX_ACQUISITION_RETRIES = 5;
  const ACQUISITION_RETRY_DELAY_MS = 3000;

  let acquisitionAttempt = 0;
  do {
    try {
      sessionStringIndex = await getAvailableSessionStringIndex(
        telegramSessionsStore
      );
    } catch (error) {
      if (
        error instanceof NoOpenTelegramSessionError &&
        acquisitionAttempt < MAX_ACQUISITION_RETRIES
      ) {
        acquisitionAttempt++;
        logger.info(
          `No telegram sessions available, retrying acquisition (${acquisitionAttempt}/${MAX_ACQUISITION_RETRIES}) in ${ACQUISITION_RETRY_DELAY_MS}ms...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, ACQUISITION_RETRY_DELAY_MS)
        );
        // Refresh session store info from DB before retrying
        telegramSessionsStore =
          (await store!.get(TELEGRAM_SESSIONS_KEY_NAME)) ?? {};
        continue;
      }
      throw error;
    }

    // If we've already tried all available sessions and none worked, we must give up.
    if (triedIndices.has(sessionStringIndex)) {
      // Find one that hasn't been tried yet if possible
      const allIndices = Array.from(
        { length: telegramSessionStrings.length },
        (_, i) => i
      );
      const remainingIndices = allIndices.filter(
        (i) => !triedIndices.has(i) && !telegramSessionsStore[i]?.isInvalid
      );

      if (remainingIndices.length > 0) {
        sessionStringIndex =
          remainingIndices[Math.floor(Math.random() * remainingIndices.length)];
      } else {
        throw new Error(
          "All available Telegram sessions failed to connect or are already in use."
        );
      }
    }

    triedIndices.add(sessionStringIndex);
    logger.info("Attempting telegram session index:", sessionStringIndex);
    const sessionString = telegramSessionStrings[sessionStringIndex];
    telegramSessionsStore[sessionStringIndex] ??= {};

    try {
      client = await getClient(sessionString);
    } catch (error: any) {
      if (error instanceof CorruptedSessionStringError) {
        logger.error("session string is corrupted", sessionStringIndex);
        telegramSessionsStore[sessionStringIndex].isInvalid = true;
        await setStoreValue(telegramSessionsStore);
      } else if (
        error instanceof AuthKeyDuplicatedError ||
        error.message?.includes("Connection to telegram failed")
      ) {
        logger.warn(
          `Session ${sessionStringIndex} is busy or connection failed. Trying another...`,
          error.message
        );
        // Continue loop to try another session
      } else {
        throw error;
      }
    }
  } while (!client);

  try {
    telegramSessionsStore[sessionStringIndex].lastConnectedAt =
      new Date().toISOString();
    await setStoreValue(telegramSessionsStore);
    logger.info(
      "available session store item",
      telegramSessionsStore[sessionStringIndex]
    );

    return await handler(client);
  } finally {
    if (client && client.connected) {
      try {
        await client.disconnect();
      } catch (disconnectError) {
        logger.warn("Failed to disconnect telegram client", disconnectError);
      }
    }

    try {
      telegramSessionsStore = (await getStoreValue()) ?? {};
      if (telegramSessionsStore[sessionStringIndex]) {
        delete telegramSessionsStore[sessionStringIndex].lastConnectedAt;
        logger.info(
          "available session store item (on cleanup)",
          telegramSessionsStore[sessionStringIndex]
        );
        await setStoreValue(telegramSessionsStore);
      }
    } catch (storeError) {
      logger.error(
        "Failed to update telegram sessions store in finally block:",
        storeError
      );
      // Don't re-throw if the handler already succeeded, but here we might want to know
    }
  }
};

export const downloadLargeFile = async (chatId: number, messageId: number) => {
  return await useTelegramClient(async (telegramClient) => {
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
        logger.warn("Failed to delete file message", error);
      }
    }
  });
};

export const delegateDownloadLargeFile = async (
  chatId: number,
  messageId: number
) => {
  // 1. Check telegram client before forwarding message
  // 2. Disconnect to prevent 406: AUTH_KEY_DUPLICATED
  // No need to check for available client here as the downloader itself will do it
  // and having an extra connection here just increases the chance of AUTH_KEY_DUPLICATED

  const channelFileMessage = await bot.telegram.copyMessage(
    STORAGE_CHANNEL_CHAT_ID,
    chatId,
    messageId,
    {
      caption: "",
    }
  );

  try {
    logger.info("downloading video using worker api...");
    const { default: pTimeout } = await importPTimeout();
    const downloadTimeoutMilliseconds = duration.seconds(
      EXECUTION_TIMEOUT - 60
    );

    let videoFileUrl: string;

    if (!TELEGRAM_SERVICE_URL) {
      throw new Error(
        "TELEGRAM_SERVICE_URL is not defined. Media delegation failed."
      );
    }
    const normalizedBaseURL = TELEGRAM_SERVICE_URL.endsWith("/")
      ? TELEGRAM_SERVICE_URL
      : TELEGRAM_SERVICE_URL + "/";

    try {
      const videoResponse = await pTimeout(
        axios.post(
          "download",
          {
            chat_id: Number(STORAGE_CHANNEL_CHAT_ID),
            message_id: channelFileMessage.message_id,
          },
          {
            baseURL: normalizedBaseURL,
            // Add axios timeout that's slightly less than pTimeout
            timeout: downloadTimeoutMilliseconds - 5000,
          }
        ),
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
    // Dont log video url for privacy reasons
    // logger.info("Downloaded video:", videoFileUrl);
    return videoFileUrl;
  } finally {
    logger.info("Deleting forwarded video message...");
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
          logger.info("Deleted forwarded video message");
        } catch (error) {
          logger.warn("Failed to delete forwarded video message", error);
        }
      } else {
        logger.warn(
          "Forwarded video message not found, might be already deleted"
        );
      }

      // Cleanup: delete old messages in the storage channel
      logger.info("Cleaning up old storage channel messages...");
      try {
        await cleanupOldChannelMessages(
          telegramClient,
          STORAGE_CHANNEL_CHAT_ID
        );
        logger.info("Cleaned up messages older than 1 hour in storage channel");
      } catch (error) {
        logger.warn("Failed to cleanup old storage channel messages", error);
      }

      // Client will be disconnected automatically by useTelegramClient finally block
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
  if (TELEGRAM_SERVICE_URL) {
    const normalizedBaseURL = TELEGRAM_SERVICE_URL.endsWith("/")
      ? TELEGRAM_SERVICE_URL
      : TELEGRAM_SERVICE_URL + "/";

    const { default: pRetry } = await importPRetry();
    return await pRetry(
      async () => {
        logger.info(
          `Delegating download of message ${messageId} to Go service...`
        );
        const response = await axios.post(
          "download",
          {
            chat_id: Number(STORAGE_CHANNEL_CHAT_ID),
            message_id: messageId,
          },
          {
            baseURL: normalizedBaseURL,
            timeout: 120000, // 2 minutes
          }
        );

        const fileUrl = response.data.url;
        logger.info(`Downloading file from S3: ${fileUrl}`);
        const fileResponse = await axios.get(fileUrl, {
          responseType: "arraybuffer",
          timeout: 300000, // 5 minutes
        });

        return Buffer.from(fileResponse.data);
      },
      {
        retries: maxRetries - 1,
        factor: 2,
        minTimeout: 2000,
        onFailedAttempt: (error) => {
          logger.warn(`Delegated download attempt failed: ${error.message}`);
        },
      }
    );
  }

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Downloading file (attempt ${attempt}/${maxRetries})...`);

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

      logger.info(`File downloaded successfully on attempt ${attempt}`);
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
          error.message.includes("EPIPE") ||
          error.message.includes("Request timeout"));

      if ((isTimeoutError || isNetworkError) && attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s
        const delaySeconds = Math.pow(2, attempt);
        logger.warn(
          `Download failed with ${
            isTimeoutError ? "Telegram timeout" : "network error"
          }: ${error.message} (attempt ${attempt}/${maxRetries})`
        );
        logger.info(`Retrying in ${delaySeconds}s...`);
        await new Promise((resolve) =>
          setTimeout(resolve, delaySeconds * 1000)
        );
      } else {
        // Non-retriable error or max retries reached
        logger.error(`Download failed permanently on attempt ${attempt}:`, {
          message: error.message,
          stack: error.stack,
          isTimeout: isTimeoutError,
          isNetwork: isNetworkError,
        });

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
