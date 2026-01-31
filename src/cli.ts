/*
  Video translate command-line utility
*/
import { fileURLToPath } from "url";
import {
  TranslateInProgressException,
  translateVideoPreferLiveVoices,
} from "./services/vtrans";
import { inspect } from "util";
import { getVideoInfo } from "./core";
import { logger } from "./logger";
// import { getLinkPreview } from "link-preview-js";

const main = async () => {
  logger.info("process.argv", process.argv);

  // const linkPreview = await getLinkPreview(
  //   "https://www.bilibili.com/video/BV1Pt42157Th",
  //   { followRedirects: "follow" }
  // );
  // console.log("linkPreview", linkPreview);
  const translateUrl = process.argv[2];
  if (!translateUrl) {
    logger.error("🔗 Please provide a URL to translate");
    process.exit(1);
  }

  try {
    // Detect source language from video
    let detectedLanguage: string | undefined = undefined;
    try {
      logger.info("🔍 Detecting video language...");
      const videoInfo = await getVideoInfo(translateUrl);
      detectedLanguage = videoInfo.language;
      if (detectedLanguage) {
        logger.info(`✅ Detected language: ${detectedLanguage}`);
      } else {
        logger.info("⚠️  Could not detect language, using auto-detection");
      }
    } catch (error) {
      logger.warn("⚠️  Failed to detect language, using auto-detection", error);
    }

    const translatedUrl = await translateVideoPreferLiveVoices(translateUrl, {
      sourceLanguage: detectedLanguage,
      targetLanguage: "ru",
    });
    logger.info(`🎉 Translated url: ${inspect(translatedUrl)}`);
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
