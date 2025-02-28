import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import axios from "axios";
import { importPTimeout } from "./utils";
import moment from "moment";
// // // @ts-expect-error no types
// import input from "input";
import {
  API_ID,
  APP_HASH,
  EXECUTION_TIMEOUT,
  SESSION,
  STORAGE_CHANNEL_CHAT_ID,
  WORKER_APP_SERVER_URL,
} from "./env";
import { bot } from "./botinstance";

const session = new StringSession(SESSION);
export const _telegramClient = new TelegramClient(session, +API_ID, APP_HASH, {
  connectionRetries: 5,
});

const mockCredentialNoSession = async () => {
  throw new Error("Telegram client session has been expired!");
};

export const getClient = async () => {
  const isLoggedIn = await _telegramClient.isUserAuthorized();
  if (!isLoggedIn) {
    await _telegramClient.start({
      // Set mock credentials and etc. (will produce exception instead of halting) in case session is expired
      phoneNumber: mockCredentialNoSession,
      password: mockCredentialNoSession,
      phoneCode: mockCredentialNoSession,
      // phoneNumber: async () => await input.text("Please enter your number: "),
      // password: async () => await input.text("Please enter your password: "),
      // phoneCode: async () =>
      //   await input.text("Please enter the code you received: "),
      onError: (error) => console.error(error),
    });
  }

  return _telegramClient;
};

export const downloadLargeFile = async (chatId: number, messageId: number) => {
  const telegramClient = await getClient();
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
  const telegramClient = await getClient();
  const channelFileMessage = await bot.telegram.forwardMessage(
    STORAGE_CHANNEL_CHAT_ID,
    chatId,
    messageId
  );
  const [fileMessage] = await telegramClient.getMessages(
    STORAGE_CHANNEL_CHAT_ID,
    {
      ids: [channelFileMessage.message_id],
    }
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
    const videoFileUrl = videoResponse.data.url;
    console.log("successfully downloaded video", videoFileUrl);
    return videoFileUrl;
  } finally {
    console.log("deleting forwarded video message");
    await fileMessage.delete({ revoke: true });
  }
};

export const downloadMessageFile = async (messageId: number) => {
  const telegramClient = await getClient();
  const [fileMessage] = await telegramClient.getMessages(
    STORAGE_CHANNEL_CHAT_ID,
    {
      ids: [messageId],
    }
  );
  const fileBuffer = (await fileMessage.downloadMedia({
    outputFile: undefined,
  })) as Buffer;

  return fileBuffer;
};
