import { Telegraf } from "telegraf";
import * as dotenv from "dotenv";

dotenv.config();

const NOTIFICATION_BOT_TOKEN = process.env.NOTIFICATION_BOT_TOKEN as string;
const NOTIFICATION_USER_ID = process.env.NOTIFICATION_USER_ID as string;

export const notificationBot = new Telegraf(NOTIFICATION_BOT_TOKEN);

notificationBot.start(async (context) => {
  await context.reply(`Hi. Your chat id: ${context.chat.id}`);
});

const escapeHtml = (unsafe: string) => {
  return unsafe
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

export const sendAdminNotification = async (message: string) => {
  notificationBot.telegram.sendMessage(
    NOTIFICATION_USER_ID,
    `<b>Yandex Video Translate</b>\n\n<code>${escapeHtml(message)}</code>`,
    { parse_mode: "HTML" }
  );
};
