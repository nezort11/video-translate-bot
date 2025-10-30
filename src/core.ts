import axios, { AxiosError } from "axios";
import { Readable } from "stream";
import { logger } from "./logger";
import { APP_ENV, IMAGE_TRANSLATE_URL, YTDL_STORAGE_BUCKET } from "./env";
import type { thumbnail } from "@distube/ytdl-core";
// import { ytdlAgent } from "./services/ytdl";
import { getVideoInfo as getVideoInfoYtdl } from "./services/ytdl";
import { getLinkPreview } from "link-preview-js";
import { delay, importNanoid, importPTimeout, percent } from "./utils";
import { translate } from "./services/translate";
import { bot } from "./botinstance";
import S3LocalStorage from "s3-localstorage";
import {
  TranslateInProgressException,
  VideoTranslateResponse,
  translateVideo,
} from "./services/vtrans";
import moment from "moment";
import http from "http";
import https from "https";
import ffmpeg from "fluent-ffmpeg";
// type-only import to avoid runtime dependency
import type { TelegramClient } from "telegram";

const LINK_REGEX = /(?:https?:\/\/)?(?:www\.)?\w+\.\w{2,}(?:\/\S*)?/gi;
const YOUTUBE_LINK_REGEX =
  /((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube(-nocookie)?\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|live\/|shorts\/|v\/)?)([\w\-]+)(\S+)?/g;

const BILIBILI_LINK_REGEX =
  /(?:https?:\/\/)?(?:www\.)?bilibili\.com\/video\/(\S{13})/g;

export enum VideoPlatform {
  YouTube = "YOUTUBE",
  Telegram = "TELEGRAM",

  Bilibili = "BILIBILI",
  Other = "OTHER",
}

export const getVideoPlatform = (link: string) => {
  // https://stackoverflow.com/a/10940138/13774599
  // but https://stackoverflow.com/a/34034823/13774599
  if (link.match(YOUTUBE_LINK_REGEX)) {
    return VideoPlatform.YouTube;
  }

  const url = new URL(link);
  if (url.protocol === "tg:") {
    return VideoPlatform.Telegram;
  }
  // if (!link.match(BILIBILI_LINK_REGEX)) {
  //   return VideoPlatform.Bilibili;
  // }

  return VideoPlatform.Other;
};

export const getYoutubeVideoId = (youtubeLink: string) =>
  Array.from(youtubeLink.matchAll(YOUTUBE_LINK_REGEX))[0][6];

// const getYoutubeThumbnailLink = (youtubeLink: string) => {
//   const youtubeVideoId = getYoutubeVideoId(youtubeLink);
//   return `https://img.youtube.com/vi/${youtubeVideoId}/mqdefault.jpg`;
// };

export const getLinkMatch = (text: string) => {
  // Youtube link is higher priority than regular link
  let linkMatch = text.match(LINK_REGEX)?.[0]; // || text.match(LINK_REGEX)?.[0];
  if (!linkMatch) {
    return;
  }
  if (!linkMatch.startsWith("http")) {
    return `https://${linkMatch}`;
  }
  return linkMatch;
};

//  use getLinkMatch if string contains link inside
export const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (error) {
    return false;
  }
};

const findMaxJpgYoutubeThumbnail = (thumbnails: thumbnail[]) => {
  let thumb: null | string = null;
  let maxThumbnailWidth = 0;
  for (const thumbnail of thumbnails) {
    if (
      thumbnail.width &&
      // thumbnail.url.includes(".jpg") &&
      thumbnail.width > maxThumbnailWidth
    ) {
      thumb = thumbnail.url;
      maxThumbnailWidth = thumbnail.width;
    }
  }

  return thumb;
};

export const getVideoInfo = async (link: string) => {
  const videoPlatform = getVideoPlatform(link);

  if (videoPlatform === VideoPlatform.Telegram) {
    const videoUrl = new URL(link);
    // const fileId = videoUrl.pathname.slice(1);
    const videoDuration = +videoUrl.searchParams.get("duration")!;
    const videoThumbnailFileId = videoUrl.searchParams.get("thumbnail");
    const videoThumbnail =
      (videoThumbnailFileId &&
        (await bot.telegram.getFileLink(videoThumbnailFileId)).href) ||
      null;

    return {
      duration: videoDuration,
      thumbnail: videoThumbnail,
    };
  }
  if (videoPlatform === VideoPlatform.YouTube) {
    // bypass error in production: UnrecoverableError: Sign in to confirm you’re not a bot
    // const videoInfo = await ytdl.getBasicInfo(link, { agent: ytdlAgent });

    // const videoInfoResponse = await axios.get<ytdl.videoInfo>("/info", {
    //   baseURL: YTDL_API_URL,
    //   params: { url: link },
    // });
    // const videoInfo = videoInfoResponse.data;
    // const videoInfo = await ytdl.getBasicInfo(link, { agent: ytdlAgent });
    // const videoInfo = await getVideoInfo(link);
    const videoInfo = await getVideoInfoYtdl(link);
    const videoThumbnail = findMaxJpgYoutubeThumbnail(
      // videoInfo.videoDetails.thumbnails
      videoInfo.thumbnails
    );
    return {
      // title: videoInfo.videoDetails.title,
      title: videoInfo.title,
      // artist: videoInfo.videoDetails.author.name,
      artist: videoInfo.channel,
      // duration: +videoInfo.videoDetails.lengthSeconds,
      duration: videoInfo.duration,
      thumbnail: videoThumbnail,
      formats: videoInfo.formats,
    };
  }

  try {
    const linkPreview = await getLinkPreview(link, {
      followRedirects: "follow",
    });
    const images = "images" in linkPreview ? linkPreview.images : [];
    return {
      title: "title" in linkPreview ? linkPreview.title : undefined,
      thumbnail: images[0],
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Request timeout") {
      console.warn(error);
      return {};
    } else {
      throw error;
    }
  }
};

const createThumbnailBuffer = (data: ArrayBuffer) => {
  const buffer = Buffer.from(data);
  logger.info(`Thumbnail downloaded: ${buffer.length}`);
  buffer.name = "mqdefault.jpg";
  return buffer;
};

const handleRequestError = (error: unknown, warning: string) => {
  if (error instanceof AxiosError) {
    logger.warn(warning, error.message);
  } else {
    throw error;
  }
};

export const getVideoThumbnail = async (videoThumbnailUrl: string) => {
  logger.info("Requesting to translate video thumbnail...");
  try {
    const { data } = await axios.post<ArrayBuffer>(
      IMAGE_TRANSLATE_URL,
      { imageLink: videoThumbnailUrl },
      { responseType: "arraybuffer" }
    );

    logger.info(`Translated video thumbnail: ${data.byteLength}`);
    return createThumbnailBuffer(data);
  } catch (error) {
    handleRequestError(error, "getting translated video thumbnail failed");
  }

  logger.info("Downloading original video thumbnail...");
  try {
    const { data } = await axios.get<ArrayBuffer>(videoThumbnailUrl, {
      responseType: "arraybuffer",
    });
    return createThumbnailBuffer(data);
  } catch (error) {
    handleRequestError(error, "getting original video thumbnail failed");
    return null;
  }
};

export const translateText = async (
  text: string,
  targetLanguageCode: string
) => {
  const { default: pTimeout } = await importPTimeout();
  const translateData = await pTimeout(translate([text], targetLanguageCode), {
    milliseconds: 10 * 1000,
  });
  return translateData.translations[0].text;
};

export const streamToBuffer = async (stream: Readable) => {
  const streamChunks: Uint8Array[] = [];
  for await (const streamChunk of stream) {
    streamChunks.push(streamChunk);
  }

  const streamBuffer = Buffer.concat(streamChunks);
  return streamBuffer;
};

export const s3Localstorage = new S3LocalStorage(YTDL_STORAGE_BUCKET);

export const uploadVideo = async (videoBuffer: Buffer) => {
  const { nanoid } = await importNanoid();
  const randomUid = nanoid();
  const storageKey = `${randomUid}.mp4`;
  await s3Localstorage.setItem(storageKey, videoBuffer);
  const videoObjectUrl = await s3Localstorage.getItemPublicLink(storageKey);
  return videoObjectUrl!;
};

const TRANSLATE_PULLING_INTERVAL = moment
  .duration(15, "seconds")
  .asMilliseconds();

export const translateVideoFinal = async (
  url: string,
  targetLanguage?: string,
  // internal: sticky selection for retries
  chosenUseLivelyVoice?: boolean
): Promise<VideoTranslateResponse> => {
  try {
    console.log("Requesting video translate...");
    if (chosenUseLivelyVoice === undefined) {
      // First attempt: try live voices; if it fails (non-progress), fallback once and stick
      try {
        const res = await translateVideo(url, {
          targetLanguage,
          useLivelyVoice: true,
        });
        return res;
      } catch (firstError) {
        if (firstError instanceof TranslateInProgressException) {
          await delay(TRANSLATE_PULLING_INTERVAL);
          logger.info("Rerequesting translation...");
          return await translateVideoFinal(url, targetLanguage, true);
        }
        // fallback and stick to old voices for all next retries
        return await translateVideoFinal(url, targetLanguage, false);
      }
    }

    // Subsequent attempts: stick to the chosen mode
    return await translateVideo(url, {
      targetLanguage,
      useLivelyVoice: chosenUseLivelyVoice,
    });
  } catch (error) {
    if (error instanceof TranslateInProgressException) {
      await delay(TRANSLATE_PULLING_INTERVAL);
      logger.info("Rerequesting translation...");
      return await translateVideoFinal(
        url,
        targetLanguage,
        chosenUseLivelyVoice
      );
    }
    throw error;
  }
};

const AXIOS_REQUEST_TIMEOUT = moment.duration(45, "minutes").asMilliseconds();

export const axiosInstance = axios.create({
  timeout: AXIOS_REQUEST_TIMEOUT,
  httpAgent: new http.Agent({
    keepAlive: true,
    timeout: AXIOS_REQUEST_TIMEOUT,
  }),
  httpsAgent: new https.Agent({
    keepAlive: true,
    timeout: AXIOS_REQUEST_TIMEOUT,
  }),
});

// Prefer mounted storage or ephemeral disk for large temporary files.
// Fallback to /tmp (512MB limit in Yandex Serverless Containers) if no mounted path is available.
export const TEMP_DIR_PATH = APP_ENV === "local" ? "/tmp" : "/app/tmp";
// process.env.TEMP_DIR_PATH || STORAGE_DIR_PATH || "/tmp";

export const mixTranslatedVideo = (
  videoFilePath: string,
  translatedAudioFilePath: string,
  resultFilePath: string,
  resultFormat: "mp4" | "mp3"
) => {
  return new Promise((resolve, reject) => {
    const command = ffmpeg()
      .input(videoFilePath)
      .input(translatedAudioFilePath)
      .complexFilter([
        {
          filter: "volume",
          options: percent(10), // 10% volume for first audio input
          inputs: "0:a",
          outputs: "a",
        },
        {
          filter: "volume",
          options: percent(100), // 100% volume for second audio input
          inputs: "1:a",
          outputs: "b",
        },
        {
          filter: "amix",
          options: { inputs: 2, dropout_transition: 0 },
          inputs: ["a", "b"],
          outputs: "mixed",
        },
      ]);

    if (resultFormat === "mp4") {
      command.outputOptions([
        "-map 0:v", // video from first input
        "-map [mixed]", // our processed audio
        "-c:v copy", // copy video without re-encoding
        "-c:a aac", // encode audio using AAC
        "-movflags +faststart", // optimize for web playback
      ]);
    } else if (resultFormat === "mp3") {
      command
        .noVideo() // drop video from the output
        .outputOptions([
          "-map [mixed]", // only output the mixed audio
          // "-c:a libmp3lame",
          "-b:a 64k", // set audio bitrate to 64kbps
          "-ac 1", // force mono audio output
        ]);
    }

    command
      .save(resultFilePath)
      .on("progress", (progress) => {
        console.log(`Ffmpeg progress: ${progress.percent}% done`);
      })
      .on("end", () => {
        console.log("Processing finished");
        // const outputBuffer_ = await fs.readFile(resultFilePath);
        // // await Promise.all([
        // //   fs.unlink(videoFilePath),
        // //   fs.unlink(translateAudioFilePath),
        // //   fs.unlink(resultFilePath),
        // // ]);
        // resolve(outputBuffer_);
        resolve(undefined);
      })
      .on("error", (err) => {
        console.error("FFmpeg error:", err);
        reject(err);
      });
  });
};

export const cleanupOldChannelMessages = async (
  telegramClient: TelegramClient,
  channelId: string,
  options?: { hours?: number; batchSize?: number }
) => {
  const hours = options?.hours ?? 1;
  const batchSize = options?.batchSize ?? 100;

  const cutoffTime = moment().subtract(hours, "hour");
  const messagesToDelete: number[] = [];

  for await (const message of telegramClient.iterMessages(channelId)) {
    const messageDate = message?.date ? moment(message.date) : null;
    if (!messageDate || !messageDate.isValid()) {
      continue;
    }
    if (message.pinned) {
      continue;
    }

    // Determine if the message contains a video
    const media = message?.media;
    const document = media && "document" in media ? media?.document : undefined;
    const mimeType =
      document && "mimeType" in document ? document?.mimeType : document;
    const docAttributes =
      document && "attributes" in document ? document?.attributes : undefined;
    const hasVideoMime =
      typeof mimeType === "string" && mimeType.startsWith("video/");
    const hasVideoAttr =
      Array.isArray(docAttributes) &&
      docAttributes.some((attr) => {
        // GramJS uses className to identify attribute types
        const className = attr?.className;
        return className === "DocumentAttributeVideo";
      });
    // Some environments may expose convenience flags
    const hasVideoFlag = Boolean(message.video || (media && "video" in media));

    const isVideoMessage = Boolean(
      hasVideoMime || hasVideoAttr || hasVideoFlag
    );

    if (isVideoMessage && messageDate.isBefore(cutoffTime)) {
      messagesToDelete.push(message.id);

      if (messagesToDelete.length >= batchSize) {
        await (telegramClient as any).deleteMessages(
          channelId,
          messagesToDelete,
          { revoke: true }
        );
        messagesToDelete.length = 0;
      }
    }
  }

  if (messagesToDelete.length > 0) {
    await (telegramClient as any).deleteMessages(channelId, messagesToDelete, {
      revoke: true,
    });
  }
};
