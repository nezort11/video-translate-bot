import axios, { AxiosError } from "axios";
import { Readable } from "stream";
import { logger } from "./logger";
import { APP_ENV, IMAGE_TRANSLATE_URL, YTDL_STORAGE_BUCKET } from "./env";
import type { thumbnail } from "@distube/ytdl-core";
// import { ytdlAgent } from "./services/ytdl";
import { getVideoInfoYtdl } from "./services/ytdl";
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
import { duration, subtract, diff, isValidDate } from "./time";
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

export class UnsupportedPlatformError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

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

  // Validate URL before creating URL object
  try {
    const url = new URL(link);
    if (url.protocol === "tg:") {
      return VideoPlatform.Telegram;
    }
    // if (!link.match(BILIBILI_LINK_REGEX)) {
    //   return VideoPlatform.Bilibili;
    // }

    return VideoPlatform.Other;
  } catch (error) {
    // Invalid URL format
    logger.warn(`Invalid URL provided: ${link}`);
    throw new UnsupportedPlatformError(`Invalid URL format: ${link}`);
  }
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
      language: undefined, // Fallback to auto for Telegram videos
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

    // Extract language from video info, fallback to undefined (auto) if not available
    let detectedLanguage: string | undefined = undefined;
    try {
      const rawLanguage = videoInfo.language || videoInfo.defaultAudioLanguage;
      if (rawLanguage && typeof rawLanguage === "string") {
        // Normalize language code (e.g., "en-US" -> "en", "zh-CN" -> "zh")
        detectedLanguage = rawLanguage.split("-")[0].toLowerCase();
      }
    } catch (error) {
      logger.warn(
        "Failed to detect video language, falling back to auto",
        error
      );
    }

    return {
      // title: videoInfo.videoDetails.title,
      title: videoInfo.title,
      // artist: videoInfo.videoDetails.author.name,
      artist: videoInfo.channel,
      // duration: +videoInfo.videoDetails.lengthSeconds,
      duration: videoInfo.duration,
      thumbnail: videoThumbnail,
      formats: videoInfo.formats,
      language: detectedLanguage,
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
      language: undefined, // Fallback to auto for other platforms
    };
  } catch (error) {
    if (error instanceof Error) {
      // Handle timeout errors
      if (error.message === "Request timeout") {
        console.warn(error);
        return {};
      }

      // Handle FetchError with maximum redirect reached (e.g., VK video, etc.)
      if (
        error.name === "FetchError" &&
        error.message.includes("maximum redirect reached")
      ) {
        logger.warn(`Unsupported platform detected: ${error.message}`);
        throw new UnsupportedPlatformError(`Platform not supported: ${link}`);
      }

      // Handle other common fetch/network errors that indicate unsupported platforms
      if (
        error.name === "FetchError" ||
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("redirect") ||
        error.message.includes("SSL") ||
        error.message.includes("certificate")
      ) {
        logger.warn(`Possible unsupported platform: ${error.message}`);
        throw new UnsupportedPlatformError(
          `Platform may not be supported: ${link}`
        );
      }
    }

    throw error;
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
  // Try to translate thumbnail if service is configured
  if (IMAGE_TRANSLATE_URL) {
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
  } else {
    logger.warn(
      "IMAGE_TRANSLATE_URL is not configured. Skipping thumbnail translation."
    );
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

const TRANSLATE_PULLING_INTERVAL_FALLBACK = duration.seconds(15);

const TRANSLATE_PULLING_INTERVAL_MIN = duration.seconds(5);

const waitForTranslation = async (error: TranslateInProgressException) => {
  // Use remainingTime from the response if available, otherwise use fallback
  const remainingTime = error.data?.remainingTime;
  const delayMs = remainingTime
    ? Math.max(remainingTime * 1000, TRANSLATE_PULLING_INTERVAL_MIN)
    : TRANSLATE_PULLING_INTERVAL_FALLBACK;
  logger.info(
    `Translation in progress, waiting ${delayMs / 1000}s before retry...`
  );
  await delay(delayMs);
  logger.info("Rerequesting translation...");
};

export const translateVideoFinal = async (
  url: string,
  targetLanguage?: string,
  sourceLanguage?: string,
  // User preference: true = prefer enhanced (live voices), false = prefer regular (faster), undefined = auto (try enhanced with fallback)
  preferEnhanced?: boolean
): Promise<VideoTranslateResponse> => {
  try {
    console.log("Requesting video translate...");
    console.log(
      "Enhanced translate preference:",
      preferEnhanced === true ? "ON" : preferEnhanced === false ? "OFF" : "AUTO"
    );
    console.log("Source language:", sourceLanguage || "auto/unknown");

    // If user explicitly turned OFF enhanced translate, always use regular voices
    if (preferEnhanced === false) {
      return await translateVideo(url, {
        targetLanguage,
        sourceLanguage,
        useLivelyVoice: false,
      });
    }

    // If user explicitly turned ON enhanced translate
    if (preferEnhanced === true) {
      // If source language is unknown/undefined, live voices are not supported
      // Fall back to regular voices to avoid "unknown language" error
      if (!sourceLanguage) {
        console.log(
          "⚠️  Source language unknown, using regular voices instead of live voices"
        );
        // return await translateVideo(url, {
        //   targetLanguage,
        //   sourceLanguage,
        //   useLivelyVoice: false,
        // });
        throw new Error(
          "Source language unknown, using regular voices instead of live voices"
        );
      }

      // Source language is known, use live voices as requested
      return await translateVideo(url, {
        targetLanguage,
        sourceLanguage,
        useLivelyVoice: true,
      });
    }

    // If undefined (auto mode for non-YouTube): try live voices first with fallback
    try {
      const res = await translateVideo(url, {
        targetLanguage,
        sourceLanguage,
        useLivelyVoice: true,
      });
      return res;
    } catch (firstError) {
      if (firstError instanceof TranslateInProgressException) {
        await waitForTranslation(firstError);
        // Retry with enhanced translate
        return await translateVideoFinal(
          url,
          targetLanguage,
          sourceLanguage,
          true
        );
      }
      // Fallback to regular voices if enhanced fails
      console.log(
        "Enhanced translate failed, falling back to regular translate"
      );
      return await translateVideo(url, {
        targetLanguage,
        sourceLanguage,
        useLivelyVoice: false,
      });
    }
  } catch (error) {
    if (error instanceof TranslateInProgressException) {
      await waitForTranslation(error);
      return await translateVideoFinal(
        url,
        targetLanguage,
        sourceLanguage,
        preferEnhanced
      );
    }
    throw error;
  }
};

/**
 * Translates a video with automatic source language detection.
 * This is a higher-level wrapper around translateVideoFinal that handles language detection.
 *
 * @param url - The video URL to translate
 * @param targetLanguage - Target language code (e.g., "ru", "en")
 * @param preferEnhanced - true = prefer enhanced (live voices), false = prefer regular, undefined = auto
 * @param sourceLanguageOverride - Optional manual source language override (skips auto-detection if provided)
 * @returns Promise with the translated video URL
 */
export const translateVideoFull = async (
  url: string,
  targetLanguage?: string,
  preferEnhanced?: boolean,
  sourceLanguageOverride?: string
): Promise<VideoTranslateResponse> => {
  let sourceLanguage: string | undefined = sourceLanguageOverride;

  // Only auto-detect if no manual override was provided
  if (sourceLanguage === undefined) {
    // Detect source language from video
    try {
      console.log("🔍 Detecting video language...");
      const videoInfo = await getVideoInfo(url);
      sourceLanguage = videoInfo.language;
      if (sourceLanguage) {
        console.log(`✅ Detected language: ${sourceLanguage}`);
      } else {
        console.log("⚠️  Could not detect language, using auto-detection");
      }
    } catch (error) {
      console.warn(
        "⚠️  Failed to detect language, using auto-detection",
        error
      );
    }
  } else {
    console.log(`🔧 Using manual source language: ${sourceLanguage}`);
  }

  // Call translateVideoFinal with detected or manual language
  return await translateVideoFinal(
    url,
    targetLanguage,
    sourceLanguage,
    preferEnhanced
  );
};

const AXIOS_REQUEST_TIMEOUT = duration.minutes(45);

export const axiosInstance = axios.create({
  timeout: AXIOS_REQUEST_TIMEOUT,
  proxy: false, // Explicitly disable proxy to prevent ECONNREFUSED errors from misconfigured proxy env vars
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

  const cutoffTime = subtract.hours(new Date(), hours);
  const messagesToDelete: number[] = [];

  for await (const message of telegramClient.iterMessages(channelId)) {
    const messageDate = message?.date ? new Date(message.date) : null;
    if (!messageDate || !isValidDate(messageDate)) {
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

    if (isVideoMessage && messageDate < cutoffTime) {
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
