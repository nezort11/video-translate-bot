import axios, { AxiosError } from "axios";
import { logger } from "./logger";
import { IMAGE_TRANSLATE_URL } from "./env";
import ytdl from "@distube/ytdl-core";
import { ytdlAgent } from "./services/ytdl";
import { getLinkPreview } from "link-preview-js";
import { importPTimeout } from "./utils";
import { translate } from "./services/translate";

const LINK_REGEX = /(?:https?:\/\/)?(?:www\.)?\w+\.\w{2,}(?:\/\S*)?/gi;
const YOUTUBE_LINK_REGEX =
  /((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube(-nocookie)?\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|live\/|shorts\/|v\/)?)([\w\-]+)(\S+)?/g;

const BILIBILI_LINK_REGEX =
  /(?:https?:\/\/)?(?:www\.)?bilibili\.com\/video\/(\S{13})/g;

export enum VideoPlatform {
  YouTube = "YOUTUBE",
  Bilibili = "BILIBILI",
  Other = "OTHER",
}

export const getVideoPlatform = (link: string) => {
  // https://stackoverflow.com/a/10940138/13774599
  // but https://stackoverflow.com/a/34034823/13774599
  if (link.match(YOUTUBE_LINK_REGEX)) {
    return VideoPlatform.YouTube;
  }
  // if (!link.match(BILIBILI_LINK_REGEX)) {
  //   return VideoPlatform.Bilibili;
  // }

  return VideoPlatform.Other;
};

export const getYoutubeVideoId = (youtubeLink: string) =>
  Array.from(youtubeLink.matchAll(YOUTUBE_LINK_REGEX))[0][6];

const getYoutubeThumbnailLink = (youtubeLink: string) => {
  const youtubeVideoId = getYoutubeVideoId(youtubeLink);
  return `https://img.youtube.com/vi/${youtubeVideoId}/mqdefault.jpg`;
};

const getLinkMatch = (text: string) => {
  // Youtube link is higher priority than regular link
  let linkMatch = text.match(YOUTUBE_LINK_REGEX)?.[0]; // || text.match(LINK_REGEX)?.[0];
  if (!linkMatch) {
    return;
  }
  if (!linkMatch.startsWith("http")) {
    return `https://${linkMatch}`;
  }
  return linkMatch;
};

export const getVideoInfo = async (link: string) => {
  const videoPlatform = getVideoPlatform(link);

  if (videoPlatform === VideoPlatform.YouTube) {
    // bypass error in production: UnrecoverableError: Sign in to confirm you’re not a bot
    // const videoInfo = await ytdl.getBasicInfo(link, { agent: ytdlAgent });

    // const videoInfoResponse = await axios.get<ytdl.videoInfo>("/info", {
    //   baseURL: YTDL_API_URL,
    //   params: { url: link },
    // });
    // const videoInfo = videoInfoResponse.data;
    const videoInfo = await ytdl.getBasicInfo(link, { agent: ytdlAgent });
    return {
      title: videoInfo.videoDetails.title,
      artist: videoInfo.videoDetails.author.name,
      duration: +videoInfo.videoDetails.lengthSeconds,
      thumbnail: getYoutubeThumbnailLink(link),
      formats: videoInfo.formats,
    };
  }

  const linkPreview = await getLinkPreview(link, { followRedirects: "follow" });
  const images = "images" in linkPreview ? linkPreview.images : [];
  return {
    title: "title" in linkPreview ? linkPreview.title : undefined,
    thumbnail: images[0],
  };
};

export const getVideoThumbnail = async (videoThumbnailUrl: string) => {
  let thumbnailData: ArrayBuffer;
  try {
    logger.info("Requesting to translate video thumbnail...");
    const thumbnailResponse = await axios.post<ArrayBuffer>(
      IMAGE_TRANSLATE_URL,
      {
        imageLink: videoThumbnailUrl,
      },
      {
        responseType: "arraybuffer",
      }
    );
    thumbnailData = thumbnailResponse.data;
    logger.info(`Translated video thumbnail: ${thumbnailData.byteLength}`);
  } catch (error) {
    if (error instanceof AxiosError) {
      logger.info("Downloading original video thumbnail...");
      const thumbnailResponse = await axios.get<ArrayBuffer>(
        videoThumbnailUrl,
        {
          responseType: "arraybuffer",
        }
      );
      thumbnailData = thumbnailResponse.data;
    } else {
      throw error;
    }
  }
  const thumbnailBuffer = Buffer.from(thumbnailData);
  logger.info(`Thumbnail downloaded: ${thumbnailBuffer.length}`);
  thumbnailBuffer.name = "mqdefault.jpg";

  return thumbnailBuffer;
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
