import fs from "fs";
import path from "path";
import ytdl, { downloadOptions } from "@distube/ytdl-core";
import { streamToBuffer } from "../core";
import { importPRetry } from "../utils";
import { logger } from "../logger";
import { DOTENV_DIR_PATH, PROXY_SERVER_URI } from "../env";

// 1. Install https://chromewebstore.google.com/detail/cclelndahbckbenkjhflpdbgdldlbecc
// 2. Go to https://youtube.com (feed index page)
// 3. Click on extension, select "JSON" and "copy" into cookies.json file (local and remote folders)
// 4. Run "pnpm s3:env:push" to update the bucket
const COOKIES_FILENAME = "cookies.json";
// cookies.json file path relative to this file
const COOKIES_FILE_PATH = path.join(
  __dirname,
  "../..", // resolve to package.json
  DOTENV_DIR_PATH,
  COOKIES_FILENAME
);

// console.log("cookiesFilePath", COOKIES_FILE_PATH);

const cookies = JSON.parse(
  fs.readFileSync(COOKIES_FILE_PATH, "utf-8")
) as Array<ytdl.Cookie>;

// console.log('cookies loaded', cookies.length)

// https://github.com/distubejs/ytdl-core#rate-limiting
export const ytdlAgent = ytdl.createProxyAgent(
  { uri: PROXY_SERVER_URI },
  cookies
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
