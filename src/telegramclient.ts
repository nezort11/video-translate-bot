import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
// // // @ts-expect-error no types
// import input from "input";
import {
  API_ID,
  APP_HASH,
  SESSION,
  STORAGE_CHANNEL_CHAT_ID,
  WORKER_APP_SERVER_URL,
} from "./env";
import { bot } from "./botinstance";
import axios from "axios";

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
    const videoResponse = await axios.post("/download", null, {
      params: {
        url: videoChannelMessageUrl.href,
      },
      baseURL: WORKER_APP_SERVER_URL,
    });
    const videoFileUrl = videoResponse.data.url;
    return videoFileUrl;
  } finally {
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
