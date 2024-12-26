/*
  Video translate command-line utility
*/
import { fileURLToPath } from "url";
import { TranslateInProgressException, translateVideo } from "./translate";

const main = async () => {
  console.log("process.argv", process.argv);
  const translateUrl = process.argv[2];
  if (!translateUrl) {
    console.error("🔗 Please provide a URL to translate");
    process.exit(1);
  }

  try {
    const translatedUrl = await translateVideo(translateUrl);
    console.log(`🎉 Translated url: ${translatedUrl}`);
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
