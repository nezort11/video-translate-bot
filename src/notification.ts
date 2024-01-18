import { Telegraf } from "telegraf";
import { NOTIFICATION_BOT_TOKEN, NOTIFICATION_USER_ID } from "./constants";
import { logger } from "./logger";
import { escapeHtml } from "./utils";

export const notificationBot = new Telegraf(NOTIFICATION_BOT_TOKEN);

notificationBot.start(async (context) => {
  await context.reply(`Hi. Your chat id: ${context.chat.id}`);
});

export const sendAdminNotification = async (message: string) => {
  try {
    await notificationBot.telegram.sendMessage(
      NOTIFICATION_USER_ID,
      `<b>Yandex Video Translate</b>\n\n<code>${escapeHtml(message)}</code>`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    logger.warn(error);
  }
};
