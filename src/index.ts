import { fileURLToPath } from "url";
import { bot } from "./bot";
import { logger } from "./logger";

const main = async () => {
  bot.launch();
  const botInfo = await bot.telegram.getMe();
  logger.info(`Started bot server on https://t.me/${botInfo.username}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
