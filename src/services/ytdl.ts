import fs from "fs";
import path from "path";
import ytdl, { downloadOptions } from "@distube/ytdl-core";
import { streamToBuffer } from "../core";
import { importPRetry } from "../utils";
import { logger } from "../logger";

// 1. Install https://chromewebstore.google.com/detail/cclelndahbckbenkjhflpdbgdldlbecc
// 2. Go to https://youtub.com (feed index page)
// 3. Click on extension, select "JSON" and "copy" into cookies.json file
const COOKIES_FILENAME = "cookies.json";
const COOKIES_FILE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "env",
  COOKIES_FILENAME
);

console.log("cookiesFilePath", COOKIES_FILE_PATH);

export const ytdlAgent = ytdl.createAgent(
  JSON.parse(fs.readFileSync(COOKIES_FILE_PATH, "utf-8"))
);

export const downloadVideo = async (
  link: string,
  options: downloadOptions = {}
): Promise<Buffer> => {
  const { default: pRetry } = await importPRetry();
  return await pRetry(
    async () => {
      const videoStream = ytdl(link, {
        agent: ytdlAgent,
        ...options,
      });

      const videoBuffer = await streamToBuffer(videoStream);
      return videoBuffer;
    },
    {
      retries: 3,
      minTimeout: 15000,
      maxTimeout: 30000,
      randomize: true,

      // Retry in case of Error: Client network socket disconnected before secure TLS connection was established (ECONNRESET)
      shouldRetry: (error) => {
        logger.log("ytdl download video error retry", error);
        return (
          error instanceof Error &&
          error.message ===
            "Client network socket disconnected before secure TLS connection was established"
          // "code" in error &&
          // error.code === "ECONNRESET"
        );
      },
    }
  );
};
