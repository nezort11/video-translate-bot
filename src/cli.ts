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
// import { getLinkPreview } from "link-preview-js";

const main = async () => {
  console.log("process.argv", process.argv);

  // const linkPreview = await getLinkPreview(
  //   "https://www.bilibili.com/video/BV1Pt42157Th",
  //   { followRedirects: "follow" }
  // );
  // console.log("linkPreview", linkPreview);
  const translateUrl = process.argv[2];
  if (!translateUrl) {
    console.error("🔗 Please provide a URL to translate");
    process.exit(1);
  }

  try {
    // Detect source language from video
    let detectedLanguage: string | undefined = undefined;
    try {
      console.log("🔍 Detecting video language...");
      const videoInfo = await getVideoInfo(translateUrl);
      detectedLanguage = videoInfo.language;
      if (detectedLanguage) {
        console.log(`✅ Detected language: ${detectedLanguage}`);
      } else {
        console.log("⚠️  Could not detect language, using auto-detection");
      }
    } catch (error) {
      console.warn("⚠️  Failed to detect language, using auto-detection", error);
    }

    const translatedUrl = await translateVideoPreferLiveVoices(translateUrl, {
      sourceLanguage: detectedLanguage,
      targetLanguage: "ru",
    });
    console.log(`🎉 Translated url: ${inspect(translatedUrl)}`);
  } catch (error) {
    if (error instanceof TranslateInProgressException) {
      console.log("⏳ Video translate is in progress...");
      return;
    }

    throw error;
  }
};

// if (process.argv[1] === fileURLToPath(import.meta.url)) {
if (require.main === module) {
  main();
}
