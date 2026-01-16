import fs from "fs";
import path from "path";
import express, { Request } from "express";
import type { ErrorObject } from "serialize-error";
import cors from "cors";
import ytdl, { videoInfo } from "@distube/ytdl-core";

// https://github.com/TypeStrong/ts-node/discussions/1290
const dynamicImport = new Function("specifier", "return import(specifier)") as <
  T,
>(
  module: string
) => Promise<T>;

export const app = express();

const COOKIES_FILENAME = "cookies.json";
const COOKIES_FILE_PATH = path.join(__dirname, "..", COOKIES_FILENAME);

console.log("cookiesFilePath", COOKIES_FILE_PATH);

const ytdlAgent = ytdl.createAgent(
  JSON.parse(fs.readFileSync(COOKIES_FILE_PATH, "utf-8"))
);

app.use(cors());

type GetInfoParams = {
  url: string;
};

app.post(
  "/info",
  async (
    req: Request<{}, videoInfo | ErrorObject, null, GetInfoParams>,
    res
  ) => {
    try {
      const videoUrl = decodeURIComponent(req.query.url);
      console.log("videoUrl", videoUrl);

      // // "https://www.youtube.com/watch?v=5bId3N7QZec"
      // const translateResult = await translateVideo(videoUrl);
      // res.json(translateResult);

      const videoInfo = await ytdl.getBasicInfo(videoUrl, { agent: ytdlAgent });
      res.json(videoInfo);
    } catch (error) {
      const { serializeError } =
        await dynamicImport<typeof import("serialize-error")>(
          "serialize-error"
        );
      const serializedError = serializeError(error);
      // https://docs.pynt.io/documentation/api-security-testing/pynt-security-tests-coverage/stack-trace-in-response
      delete serializedError.stack;
      res.status(500).json(serializedError);
    }
  }
);
