/*
  Video translate command-line utility
*/
import { fileURLToPath } from "url";
import {
  translateVideoFull,
} from "./core";
import { TranslateInProgressException } from "./services/vtrans";
import { inspect } from "util";
import { logger } from "./logger";

const main = async () => {
  logger.info("process.argv", process.argv);

  const translateUrl = process.argv[2];
  if (!translateUrl) {
    logger.error("🔗 Please provide a URL or local file path to translate");
    process.exit(1);
  }

  try {
    const translationResult = await translateVideoFull(translateUrl, "ru");
    logger.info(`🎉 Translation result: ${inspect(translationResult)}`);
  } catch (error) {
    if (error instanceof TranslateInProgressException) {
      logger.info("⏳ Video translate is in progress...");
      return;
    }

    throw error;
  }
};

// if (process.argv[1] === fileURLToPath(import.meta.url)) {
if (require.main === module) {
  main();
}
