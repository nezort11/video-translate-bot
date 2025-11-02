import express, { Request, Response } from "express";
import { Api } from "telegram";
import type { ErrorObject } from "serialize-error";
import cors from "cors";
import type { videoInfo } from "@distube/ytdl-core";
import { Readable } from "stream";
import {
  downloadVideo,
  getVideoDownloadUrl,
  getVideoInfo,
  // downloadYoutubeVideo,
  // ytdlAgent,
} from "./services/ytdl";
import { logger } from "./logger";
import {
  TranslateException,
  TranslateInProgressException,
  VideoTranslateResponse,
  translateVideoPreferLiveVoices,
} from "./services/vtrans";
import S3Localstorage from "s3-localstorage";
import {
  DEBUG_ENV,
  LOGGING_CHANNEL_CHAT_ID,
  // STORAGE_CHANNEL_CHAT_ID,
  YTDL_STORAGE_BUCKET,
} from "./env";
import { downloadMessageFile, useTelegramClient } from "./telegramclient";
import {
  TEMP_DIR_PATH,
  VideoPlatform,
  axiosInstance,
  mixTranslatedVideo,
  getVideoPlatform,
  getVideoThumbnail,
  s3Localstorage,
  translateText,
  translateVideoFinal,
  uploadVideo,
} from "./core";
// import bot instance with logger middlewares attached
import path from "path";
import fs from "fs/promises";
import { bot } from "./bot";
import {
  handleInternalErrorExpress,
  importNanoid,
  serializeErrorAsync,
} from "./utils";

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
  lang?: string; // currently supports ru,en,kk https://github.com/FOSWLY/vot-cli/wiki/%5BEN%5D-Supported-langs
  videoUrl?: string;
  subtitlesUrl?: string;
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
      const videoUrl = req.query.url;
      const targetLanguageCode = req.query.lang;
      const videoFileUrl = req.query.videoUrl;
      const subtitlesFileUrl = req.query.subtitlesUrl;
      console.log("videoUrl", videoUrl);
      console.log("languageCode", targetLanguageCode);

      // "https://www.youtube.com/watch?v=5bId3N7QZec"
      const translateResult = await translateVideoPreferLiveVoices(videoUrl, {
        targetLanguage: targetLanguageCode,
        videoFileUrl,
        subtitlesFileUrl,
      });
      res.json(translateResult);
    } catch (error: unknown) {
      if (error instanceof TranslateException) {
        const serializedTranslateError = await serializeErrorAsync(error);

        if (error instanceof TranslateInProgressException) {
          // Translate in progress is not error just a expected exception
          delete serializedTranslateError.stack;
          res.status(202).json(serializedTranslateError);
        } else {
          res.status(400).json(serializedTranslateError);
        }
      } else {
        await handleInternalErrorExpress(error, res);
      }
    }
  }
);

type FullVideoTranslateParams = {
  url: string;
  videoUrl: string;
  lang?: string;
  subtitlesUrl?: string;
};

class MissingParameterError extends TranslateException {
  constructor(params: string[]) {
    super(`Missing required parameter(s): ${params.join(", ")}`);
    this.name = MissingParameterError.constructor.name;
  }
}

// https://console.yandex.cloud/folders/b1gjh7irh9poadr6llcg/storage/buckets/ytdl-service
app.post(
  "/translate/full",
  async (
    req: Request<
      {},
      VideoTranslateResponse | ErrorObject,
      null,
      FullVideoTranslateParams
    >,
    res
  ) => {
    try {
      const videoUrl = req.query.url;
      const targetLanguageCode = req.query.lang;
      const videoFileUrl = req.query.videoUrl;
      // const subtitlesFileUrl = req.query.subtitlesUrl;
      console.log("videoUrl", videoUrl);
      console.log("languageCode", targetLanguageCode);

      // "https://www.youtube.com/watch?v=5bId3N7QZec"
      if (!videoUrl || !videoFileUrl) {
        const missingParams: string[] = [];
        if (!videoUrl) {
          missingParams.push("url");
        }
        if (!videoFileUrl) {
          missingParams.push("videoUrl");
        }
        throw new MissingParameterError(missingParams);
      }

      const videoTranslateData = await translateVideoFinal(videoUrl);
      const translationUrl = videoTranslateData.url;

      logger.info("Downloading translation...");
      const translateAudioResponse = await axiosInstance.get<ArrayBuffer>(
        translationUrl,
        {
          responseType: "arraybuffer",
        }
      );
      const translateAudioBuffer = Buffer.from(translateAudioResponse.data);
      logger.info(`Downloaded translation: ${translateAudioBuffer.length}`);

      logger.info("Downloading video...");
      const videoResponse = await axiosInstance.get<ArrayBuffer>(videoFileUrl, {
        responseType: "arraybuffer",
      });
      const videoBuffer = Buffer.from(videoResponse.data);
      logger.info(`Downloaded video: ${videoBuffer.length}`);

      const videoFilePath = path.join(TEMP_DIR_PATH, "source.mp4");
      const translatedAudioFilePath = path.join(TEMP_DIR_PATH, "source3.mp3");
      await fs.writeFile(videoFilePath, videoBuffer);
      await fs.writeFile(translatedAudioFilePath, translateAudioBuffer);

      const resultFilePath = path.join(TEMP_DIR_PATH, "video.mp4");
      await mixTranslatedVideo(
        videoFilePath,
        translatedAudioFilePath,
        resultFilePath,
        "mp4"
      );
      const outputBuffer = await fs.readFile(resultFilePath);

      const resultVideoUrl = await uploadVideo(outputBuffer);

      res.json({ url: resultVideoUrl });
    } catch (error: unknown) {
      console.log("Handling full translate exception error...");
      if (error instanceof TranslateException) {
        const serializedTranslateError = await serializeErrorAsync(error);

        if (error instanceof TranslateInProgressException) {
          // Translate in progress is not error just a expected exception
          delete serializedTranslateError.stack;
          res.status(202).json(serializedTranslateError);
        } else {
          res.status(400).json(serializedTranslateError);
        }
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
      const videoUrl = req.query.url;
      console.log("videoUrl", videoUrl);

      // // "https://www.youtube.com/watch?v=5bId3N7QZec"
      // const translateResult = await translateVideo(videoUrl);
      // res.json(translateResult);

      // const videoInfo = await ytdl.getBasicInfo(videoUrl, { agent: ytdlAgent });
      // res.json(videoInfo);
      const videoInfo = await getVideoInfo(videoUrl);
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
      const videoLink = req.query.url;
      console.log("videoUrl", videoLink);

      // // "https://www.youtube.com/watch?v=5bId3N7QZec"
      // const translateResult = await translateVideo(videoUrl);
      // res.json(translateResult);

      // const videoInfo = await ytdl.getBasicInfo(videoUrl, { agent: ytdlAgent });

      // const formats = videoInfo.formats;
      // console.log("formats", formats);
      // const a = ytdl.downloadFromInfo(videoInfo, {
      //   format: formats[0],
      // });

      const videoPlatform = getVideoPlatform(videoLink);
      let videoFileUrl: string;
      // let videoBuffer: Buffer;
      if (videoPlatform === VideoPlatform.YouTube) {
        const format = parseInt(req.query.format);
        // console.log("downloading video streaming to buffer...");
        // videoBuffer = await downloadYoutubeVideo(videoLink, {
        //   quality: format,
        // });

        // Use new direct URL approach to avoid gateway timeout
        console.log("Getting direct YouTube download URL...");
        const downloadUrlData = await getVideoDownloadUrl(videoLink, format);
        console.log(`Got direct URL (format: ${downloadUrlData.format_id}, quality: ${downloadUrlData.quality})`);

        // For the /download API endpoint, we still need to upload to our storage
        // So we download from YouTube and upload to S3
        console.log("Downloading from YouTube...");
        const videoResponse = await axiosInstance.get<ArrayBuffer>(downloadUrlData.url, {
          responseType: "arraybuffer",
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 600000, // 10 minutes
        });
        const videoBuffer = Buffer.from(videoResponse.data);
        console.log(`Downloaded ${videoBuffer.byteLength} bytes`);

        // Upload to S3 storage
        videoFileUrl = await uploadVideo(videoBuffer);
        console.log("Uploaded to storage:", videoFileUrl);
      } else if (videoPlatform === VideoPlatform.Telegram) {
        const videoUrl = new URL(videoLink);
        const videoMessageId = +videoUrl.pathname.slice(1);
        console.log(
          "requesting download video with message id",
          videoMessageId
        );
        const videoBuffer = await downloadMessageFile(videoMessageId);
        console.log(
          "downloaded video from telegram buffer",
          videoBuffer.byteLength
        );
        videoFileUrl = await uploadVideo(videoBuffer);
      } else {
        throw new Error("Unsupported video url platform");
      }

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

      console.log("video file url", videoFileUrl);

      res.json({
        url: videoFileUrl,
        // byteLength: videoBuffer.byteLength
        byteLength: 0,
      });
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
    const presignedVideoObjectUrl = await s3Localstorage.getItemLink(
      videoKey,
      "PUT",
      {
        expiresIn: 60 * 60,
      }
    );

    res.json({ url: presignedVideoObjectUrl });
  } catch (error) {
    await handleInternalErrorExpress(error, res);
  }
});

app.post(
  "/send",
  async (req: Request<{}, void | ErrorObject, SendVideoBody, null>, res) => {
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
        thumbnailBuffer =
          (await getVideoThumbnail(videoThumbnailUrl)) ?? undefined;
      }

      const outputBuffer: Buffer = await s3Localstorage.getItem(key, null);
      outputBuffer.name = `${videoTitle}.mp4`;

      let fileMessageId: number;
      await useTelegramClient(async (telegramClient) => {
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
        fileMessageId = fileMessage.id;
      });

      await bot.telegram.copyMessage(
        chatId,
        LOGGING_CHANNEL_CHAT_ID,
        fileMessageId!
      );

      res.status(200).send();
    } catch (error) {
      await handleInternalErrorExpress(error, res);
    }
  }
);

type DownloadThumbnail = {
  link: string;
};

type DownloadThumbnailResponse = {
  thumbnail: string | null;
};

app.post(
  "/debug/download/thumbnail",
  async (
    req: Request<
      {},
      DownloadThumbnailResponse | ErrorObject,
      DownloadThumbnail,
      null
    >,
    res
  ) => {
    try {
      const { link } = req.body;
      console.log("getting video info...");
      const videoInfo = await getVideoInfo(link);
      console.log("got video info thumbnail", videoInfo.thumbnail);
      if (videoInfo.thumbnail) {
        console.log("downloading video thumbnail...");
        const thumbnail = await getVideoThumbnail(videoInfo.thumbnail);
        console.log("downloaded thumbnail size", thumbnail?.byteLength);

        return res.status(200).json({ thumbnail: thumbnail?.byteLength });
      }

      res.status(200).send();
    } catch (error) {
      await handleInternalErrorExpress(error, res);
    }
  }
);
