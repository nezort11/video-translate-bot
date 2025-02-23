import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
// // // @ts-expect-error no types
// import input from "input";
import { API_ID, APP_HASH, SESSION, STORAGE_CHANNEL_CHAT_ID } from "./env";
import { bot } from "./botinstance";

const session = new StringSession(SESSION);
export const telegramClient = new TelegramClient(session, +API_ID, APP_HASH, {
  connectionRetries: 5,
});

const mockCredentialNoSession = async () => {
  throw new Error("Telegram client session has been expired!");
};

export const getClient = async () => {
  const isLoggedIn = await telegramClient.isUserAuthorized();
  if (!isLoggedIn) {
    await telegramClient.start({
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

  return telegramClient;
};

export const downloadLargeFile = async (chatId: number, messageId: number) => {
  const forwardedFileMessage = await bot.telegram.forwardMessage(
    STORAGE_CHANNEL_CHAT_ID,
    chatId,
    messageId
  );

  // try {
  const telegramClient = await getClient();
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
