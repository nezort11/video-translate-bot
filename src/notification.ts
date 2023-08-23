import { Telegraf } from "telegraf";
import { NOTIFICATION_BOT_TOKEN, NOTIFICATION_USER_ID } from "./constants";

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
