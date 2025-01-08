import express, { Request, Response } from "express";
import type { ErrorObject } from "serialize-error";
import cors from "cors";
import ytdl, { videoInfo } from "@distube/ytdl-core";
import { Readable } from "stream";
import { ytdlAgent } from "./services/ytdl";
import { logger } from "./logger";
import { VideoTranslateResponse, translateVideo } from "./services/vtrans";
import S3Localstorage from "s3-localstorage";
import { YTDL_STORAGE_BUCKET } from "./env";

// https://github.com/TypeStrong/ts-node/discussions/1290
const dynamicImport = new Function("specifier", "return import(specifier)") as <
  T
>(
  module: string
) => Promise<T>;

const importSerializeError = async () =>
  await dynamicImport<typeof import("serialize-error")>("serialize-error");

const importNanoid = async () =>
  await dynamicImport<typeof import("nanoid")>("nanoid");

const handleExpressError = async (
  error: unknown,
  res: Response<ErrorObject>
) => {
  console.error(error);

  const { serializeError } = await importSerializeError();
  const serializedError = serializeError(error);
  // https://docs.pynt.io/documentation/api-security-testing/pynt-security-tests-coverage/stack-trace-in-response
  delete serializedError.stack;
  res.status(500).json(serializedError);
};

const streamToBuffer = async (stream: Readable) => {
  const streamChunks: Uint8Array[] = [];
  for await (const streamChunk of stream) {
    streamChunks.push(streamChunk);
  }

  const streamBuffer = Buffer.concat(streamChunks);
  return streamBuffer;
};

const s3Localstorage = new S3Localstorage(YTDL_STORAGE_BUCKET);

export const app = express();

// const COOKIES_FILENAME = "cookies.json";
// const COOKIES_FILE_PATH = path.join(__dirname, "..", COOKIES_FILENAME);

// console.log("cookiesFilePath", COOKIES_FILE_PATH);

// const ytdlAgent = ytdl.createAgent(
//   JSON.parse(fs.readFileSync(COOKIES_FILE_PATH, "utf-8"))
// );

app.use(cors());

app.post("/debug/timeout", async (req, res) => {
  setInterval(() => {
    logger.info(`Debug timeout ${new Date().toLocaleString()}`);
  }, 5000);
});

type VideoTranslateParams = {
  url: string;
};

type GetInfoParams = {
  url: string;
};

type YtdlDownloadParams = {
  url: string;
  format: string;
};

app.post(
  "/translate",
  async (
    req: Request<
      {},
      VideoTranslateResponse | ErrorObject,
      null,
      VideoTranslateParams
    >,
    res
  ) => {
    try {
      const videoUrl = decodeURIComponent(req.query.url);
      console.log("videoUrl", videoUrl);

      // "https://www.youtube.com/watch?v=5bId3N7QZec"
      const translateResult = await translateVideo(videoUrl);
      res.json(translateResult);
    } catch (error) {
      await handleExpressError(error, res);
    }
  }
);

app.get(
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
      await handleExpressError(error, res);
    }
  }
);

app.post(
  "/download",
  async (
    req: Request<{}, any | ErrorObject, null, YtdlDownloadParams>,
    res
  ) => {
    try {
      const videoUrl = decodeURIComponent(req.query.url);
      console.log("videoUrl", videoUrl);
      const format = parseInt(req.query.format);

      // // "https://www.youtube.com/watch?v=5bId3N7QZec"
      // const translateResult = await translateVideo(videoUrl);
      // res.json(translateResult);

      // const videoInfo = await ytdl.getBasicInfo(videoUrl, { agent: ytdlAgent });

      // const formats = videoInfo.formats;
      // console.log("formats", formats);
      // const a = ytdl.downloadFromInfo(videoInfo, {
      //   format: formats[0],
      // });

      const videoStream = ytdl(videoUrl, {
        agent: ytdlAgent,
        quality: format,
      });

      const videoBuffer = await streamToBuffer(videoStream);
      console.log("video buffer length", videoBuffer.byteLength);

      const { nanoid } = await importNanoid();
      const randomUid = nanoid();
      const storageKey = `${randomUid}.mp4`;
      await s3Localstorage.setItem(storageKey, videoBuffer);
      const videoObjectUrl = await s3Localstorage.getItemPublicLink(storageKey);

      // await s3Localstorage.setItem();

      // res.send(`${videoBuffer.byteLength}`);

      // res.set({
      //   "Content-Type": "video/mp4",
      //   "Content-Length": videoBuffer.length,
      // });
      // res.send(videoBuffer);
      // const videoInfo = await ytdl.getBasicInfo(videoUrl, { agent: ytdlAgent });
      // videoInfo.formats;
      // res.json(videoInfo);

      res.json({ url: videoObjectUrl, byteLength: videoBuffer.byteLength });
    } catch (error) {
      await handleExpressError(error, res);
    }
  }
);
