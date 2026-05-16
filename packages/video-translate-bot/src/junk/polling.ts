import { logger } from "../logger";
import { bot } from "../bot";
import {
  BOT_TOKEN,
  BOT_TOKEN_PROD,
  DEBUG,
  setIsPublic,
  BOT_PUBLIC_USERNAME,
} from "../env";
import { initUpdatesTable } from "../db";

/**
 * @deprecated Polling is deprecated and moved to junk. Use webhooks instead.
 */
export const runPolling = async () => {
  if (BOT_TOKEN === BOT_TOKEN_PROD && process.env.BOT_POLLING !== "true") {
    logger.error(
      "❌ CRITICAL ERROR: Attempting to run PRODUCTION bot locally with polling! This will delete the webhook."
    );
    logger.error("Please use BOT_TOKEN_DEV or set NODE_ENV=development.");
    process.exit(1);
  }

  await initUpdatesTable();

  logger.info(`VERSION: ${process.version}`);
  logger.info(`DEBUG: ${DEBUG}`);

  // Auto-reconnect proxy on network errors during update handling
  bot.catch(async (error: unknown, _ctx: any) => {
    // Re-throw so the original bot.catch in bot.ts handles the user reply
    throw error;
  });

  const RETRY_DELAY_MS = 10_000;

  // Retry loop: keep trying to connect until Telegram is reachable.
  while (true) {
    try {
      logger.info("Deleteting webhook before launch...");
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });

      bot.launch({ dropPendingUpdates: true });
      const botInfo = await bot.telegram.getMe();

      setIsPublic(botInfo.username === BOT_PUBLIC_USERNAME);
      logger.info(`🚀 Started bot server on https://t.me/${botInfo.username}`);
      break; // success — exit the retry loop
    } catch (error) {
      logger.error("❌ Failed to connect to Telegram:", error);
      logger.warn(`⏳ Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
};
