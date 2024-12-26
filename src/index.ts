import http from "serverless-http";
// import { fileURLToPath } from "url";
// import storage from "node-persist";
import { bot } from "./bot";
import { logger } from "./logger";
import { setIsPublic, NODE_ENV, DEBUG, BOT_PUBLIC_USERNAME } from "./env";
import { telegramLoggerContext } from "./telegramlogger";

export const handler = http(bot.webhookCallback("/webhook"));

const main = async () => {
  logger.info(`VERSION: ${process.version}`);
  logger.info(`DEBUG: ${DEBUG}`);

  // await storage.init({ dir: "./session/storage" });

  bot.launch();
  const botInfo = await bot.telegram.getMe();
  setIsPublic(botInfo.username === BOT_PUBLIC_USERNAME);
  logger.info(`🚀 Started bot server on https://t.me/${botInfo.username}`);
  try {
    await telegramLoggerContext.reply(`🚀 Started bot server`);
  } catch (error) {
    console.warn(error);
  }
};

// if (process.argv[1] === fileURLToPath(import.meta.url)) {
if (require.main === module) {
  main();
}
