import fs from "fs";
import path from "path";
import ytdl from "@distube/ytdl-core";

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
