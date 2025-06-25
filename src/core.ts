import axios, { AxiosError } from "axios";
import { Readable } from "stream";
import { logger } from "./logger";
import { IMAGE_TRANSLATE_URL, YTDL_STORAGE_BUCKET } from "./env";
import ytdl, { thumbnail } from "@distube/ytdl-core";
// import { ytdlAgent } from "./services/ytdl";
import { getLinkPreview } from "link-preview-js";
import { importNanoid, importPTimeout } from "./utils";
import { translate } from "./services/translate";
import { bot } from "./botinstance";
import S3LocalStorage from "s3-localstorage";

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
    const videoInfo = await ytdl.getBasicInfo(link, { agent: ytdlAgent });
    const videoThumbnail = findMaxJpgYoutubeThumbnail(
      videoInfo.videoDetails.thumbnails
    );
    return {
      title: videoInfo.videoDetails.title,
      artist: videoInfo.videoDetails.author.name,
      duration: +videoInfo.videoDetails.lengthSeconds,
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
