import { fileURLToPath } from "url";
import { bot } from "./bot";
import { logger } from "./logger";
import { setIsPublic, NODE_ENV, DEBUG, BOT_PUBLIC_USERNAME } from "./constants";

const main = async () => {
  logger.info(`VERSION: ${process.version}`);
  logger.info(`DEBUG: ${DEBUG}`);
  logger.info(`NODE_ENV: ${NODE_ENV}`);

  bot.launch();
  const botInfo = await bot.telegram.getMe();
  setIsPublic(botInfo.username === BOT_PUBLIC_USERNAME);
  logger.info(`Started bot server on https://t.me/${botInfo.username}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
