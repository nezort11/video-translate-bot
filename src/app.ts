import express, { Request, Response } from "express";
import { Api } from "telegram";
import type { ErrorObject } from "serialize-error";
import cors from "cors";
import ytdl, { videoInfo } from "@distube/ytdl-core";
import { Readable } from "stream";
import { ytdlAgent } from "./services/ytdl";
import { logger } from "./logger";
import {
  TranslateException,
  TranslateInProgressException,
  VideoTranslateResponse,
  translateVideo,
} from "./services/vtrans";
import S3Localstorage from "s3-localstorage";
import {
  DEBUG_ENV,
  LOGGING_CHANNEL_CHAT_ID,
  STORAGE_CHANNEL_CHAT_ID,
  YTDL_STORAGE_BUCKET,
} from "./env";
import { getClient } from "./telegramclient";
import { getVideoInfo, getVideoThumbnail, translateText } from "./core";
// import bot instance with logger middlewares attached
import { bot } from "./bot";

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

const serializeError = async (error: unknown) => {
  const { serializeError } = await importSerializeError();
  const serializedError = serializeError(error);
  console.log("serialized error", serializeError);
  // https://docs.pynt.io/documentation/api-security-testing/pynt-security-tests-coverage/stack-trace-in-response
  if (DEBUG_ENV !== "true") {
    delete serializedError.stack;
  }
  return serializedError;
};

const handleInternalErrorExpress = async (
  error: unknown,
  res: Response<ErrorObject>
) => {
  console.error(error);
  const serializedError = await serializeError(error);
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
app.use(express.json());

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

type SendVideoBody = {
  key: string;
  link: string;
  duration: number;
  chatId: number | string;
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
      if (error instanceof TranslateInProgressException) {
        res.status(202).json({ message: "Translation in progress..." });
      } else if (error instanceof TranslateException) {
        const serializedTranslateError = await serializeError(error);
        res.status(400).json(serializedTranslateError);
      } else {
        await handleInternalErrorExpress(error, res);
      }
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
      await handleInternalErrorExpress(error, res);
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

      console.log("create ytdl stream");
      const videoStream = ytdl(videoUrl, {
        agent: ytdlAgent,
        quality: format,
      });
      console.log("ytdl video stream", videoStream);

      console.log("downloading video streaming to buffer...");
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
      await handleInternalErrorExpress(error, res);
    }
  }
);

app.post("/upload", async (req, res) => {
  try {
    const { nanoid } = await importNanoid();
    const videoId = nanoid();
    const videoKey = `${videoId}.mp4`;
    // https://docs.aws.amazon.com/AmazonS3/latest/API/s3_example_s3_Scenario_PresignedUrl_section.html
    const presignedVideoObjectUrl = await s3Localstorage.getItemLink(videoKey, {
      expiresIn: 60 * 60,
    });

    res.json({ url: presignedVideoObjectUrl });
  } catch (error) {
    await handleInternalErrorExpress(error, res);
  }
});

app.post(
  "/send",
  async (req: Request<{}, any | ErrorObject, SendVideoBody, null>, res) => {
    try {
      const { key, link, duration, chatId } = req.body;
      const videoLink = link;
      const videoDuration = duration;
      const videoInfo = await getVideoInfo(link);
      let videoTitle = videoInfo.title;
      if (videoTitle) {
        try {
          console.log("Translating video title...");
          videoTitle = await translateText(videoTitle, "ru");
        } catch (error) {
          console.warn("Error during title translation", error);
        }
      }

      const originalArtist = videoInfo.artist;
      let artist = originalArtist;
      if (artist) {
        try {
          console.log("Translating video artist...");
          artist = await translateText(artist, "ru");
        } catch (error) {
          console.warn("Error during artist translation", error);
        }
      }
      const videoThumbnailUrl = videoInfo.thumbnail;

      let thumbnailBuffer: Buffer | undefined;
      if (videoThumbnailUrl) {
        thumbnailBuffer = await getVideoThumbnail(videoThumbnailUrl);
      }

      const outputBuffer: Buffer = await s3Localstorage.getItem(key, null);
      outputBuffer.name = `${videoTitle}.mp4`;

      const telegramClient = await getClient();
      const fileMessage = await telegramClient.sendFile(
        // STORAGE_CHANNEL_CHAT_ID,
        // just use logging channel as a intermediate storage channel
        LOGGING_CHANNEL_CHAT_ID,
        {
          file: outputBuffer,
          caption: `📺 <b>${videoTitle}</b>\n— ${artist} (${originalArtist})\n${videoLink}`,
          parseMode: "html",
          thumb: thumbnailBuffer,
          attributes: [
            new Api.DocumentAttributeVideo({
              w: 640,
              h: 360,
              duration: Math.floor(videoDuration),
              supportsStreaming: true,
            }),
          ],
        }
      );
      const fileMessageId = fileMessage.id;

      await bot.telegram.copyMessage(
        chatId,
        LOGGING_CHANNEL_CHAT_ID,
        fileMessageId
      );

      res.status(200).send();
    } catch (error) {
      await handleInternalErrorExpress(error, res);
    }
  }
);
