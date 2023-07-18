import * as dotenv from "dotenv";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
// @ts-expect-error no types
import input from "input";

dotenv.config({ path: "./.env" });

const API_ID = process.env.APP_ID as string;
const APP_HASH = process.env.APP_HASH as string;
const SESSION = process.env.SESSION as string;

const session = new StringSession(SESSION);
export const telegramClient = new TelegramClient(session, +API_ID, APP_HASH, {
  connectionRetries: 5,
});

export const getClient = async () => {
  if (!(await telegramClient.isUserAuthorized())) {
    await telegramClient.start({
      phoneNumber: async () => await input.text("Please enter your number: "),
      password: async () => await input.text("Please enter your password: "),
      phoneCode: async () =>
        await input.text("Please enter the code you received: "),
      onError: (error) => console.error(error),
    });
  }

  return telegramClient;
};
