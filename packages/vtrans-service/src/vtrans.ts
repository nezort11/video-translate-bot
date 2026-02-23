/*
  Credit: https://github.com/FOSWLY/vot-cli
  Requirements: Node.js 18+ (crypto), protobufjs, axios
 */

import protobuf, { Message } from "protobufjs";
import crypto from "crypto";
import axios from "axios";
import {
  YANDEX_TRANSLATE_HMAC_SHA254_SECRET,
  YANDEX_COOKIES_HEADER_STRING,
  YANDEX_OAUTH_ACCESS_TOKEN,
} from "./env";
// import { logger } from "../logger";

const logger = console;

const YANDEX_VIDEO_TRANSLATE_URL =
  "https://api.browser.yandex.ru/video-translation/translate";
const YANDEX_SESSION_CREATE_URL =
  "https://api.browser.yandex.ru/session/create";
const YANDEX_BROWSER_VERSION = "25.12.0.2215";
const YANDEX_BROWSER_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 YaBrowser/${YANDEX_BROWSER_VERSION} Safari/537.36`;

export const YANDEX_VIDEO_TRANSLATE_LANGUAGES = ["ru", "en", "kk"];

const VideoTranslationHelpObjectProto = new protobuf.Type(
  "VideoTranslationHelpObject"
)
  .add(new protobuf.Field("target", 1, "string")) // string enum "video_file_url", "subtitles_file_url"
  .add(new protobuf.Field("targetUrl", 2, "string")); // url to video file or url to subtitles file

const VideoTranslateRequestProto = new protobuf.Type("VideoTranslationRequest")
  .add(new protobuf.Field("url", 3, "string"))
  .add(new protobuf.Field("deviceId", 4, "string")) // used in mobile version
  .add(new protobuf.Field("firstRequest", 5, "bool")) // true for the first request, false for subsequent ones
  .add(new protobuf.Field("duration", 6, "double"))
  .add(new protobuf.Field("unknown0", 7, "int32")) // 1
  // source language code
  .add(new protobuf.Field("language", 8, "string"))
  // forceSourceLang
  // 0 - auto detected by yabrowser, 1 - user set his (own lang by dropdown)
  // 0 - without translationHelp | 1 - with translationHelp (??? But it works without it)
  .add(new protobuf.Field("forceSourceLang", 9, "bool")) // 0 - auto detected, 1 - user set
  .add(new protobuf.Field("unknown1", 10, "int32")) // 0
  .add(
    new protobuf.Field(
      "translationHelp",
      11,
      "VideoTranslationHelpObject",
      "repeated"
    )
  ) // array for translation assistance ([0] -> {2: link to video, 1: "video_file_url"}, [1] -> {2: link to subtitles, 1: "subtitles_file_url"})
  .add(new protobuf.Field("wasStream", 13, "bool")) // set true if it's ended stream
  .add(new protobuf.Field("responseLanguage", 14, "string")) // YANDEX_VIDEO_TRANSLATE_LANGUAGES
  .add(new protobuf.Field("unknown2", 15, "int32")) // 1?
  .add(new protobuf.Field("unknown3", 16, "int32")) // before april 2025 is 1, but now it's 2
  // they have some kind of limiter on requests from one IP - because after one such request it stops working
  .add(new protobuf.Field("bypassCache", 17, "bool"))
  // translates videos with higher-quality voices, but sometimes the voice of one person can constantly change
  // https://github.com/ilyhalight/voice-over-translation/issues/897
  .add(new protobuf.Field("useLivelyVoice", 18, "bool")) // higher-quality voices (live voices)
  .add(new protobuf.Field("videoTitle", 19, "string")); // video title

const VideoTranslateResponseProto = new protobuf.Type(
  "VideoTranslationResponse"
)
  .add(new protobuf.Field("url", 1, "string"))
  .add(new protobuf.Field("duration", 2, "double"))
  .add(new protobuf.Field("status", 4, "int32"))
  .add(new protobuf.Field("remainingTime", 5, "int32")) // secs before translation (used as interval before next request in yaBrowser)
  .add(new protobuf.Field("unknown6", 6, "int32")) // unknown 0 (1st request) -> 10 (2nd, 3th and etc requests)
  .add(new protobuf.Field("code", 7, "string"))
  .add(new protobuf.Field("language", 8, "string")) // detected language (if the wrong one is set)
  .add(new protobuf.Field("message", 9, "string"));

const YandexSessionRequestProto = new protobuf.Type("YandexSessionRequest")
  .add(new protobuf.Field("uuid", 1, "string"))
  .add(new protobuf.Field("module", 2, "string"));

const YandexSessionResponseProto = new protobuf.Type("YandexSessionResponse")
  .add(new protobuf.Field("secretKey", 1, "string"))
  .add(new protobuf.Field("expires", 2, "int32"));

new protobuf.Root()
  .define("yandex")
  .add(VideoTranslationHelpObjectProto)
  .add(VideoTranslateRequestProto)
  .add(VideoTranslateResponseProto)
  .add(YandexSessionRequestProto)
  .add(YandexSessionResponseProto);

enum TranslationHelp {
  VideoFileUrl = "video_file_url",
  SubtitlesFileUrl = "subtitles_file_url",
}

export type SourceLanguage =
  | "ru"
  | "en"
  | "zh"
  | "ko"
  | "ar"
  | "fr"
  | "it"
  | "es"
  | "de"
  | "ja";

export type TargetLanguage = "ru" | "en" | "kk";

type VideoTranslateOptions = {
  url: string;
  // used to translate non-english videos properly when auto detected language is wrong
  // undefined means auto-detect
  sourceLanguage?: SourceLanguage | string;
  targetLanguage?: string | TargetLanguage;

  videoFileUrl?: string;
  subtitlesFileUrl?: string;
  useLivelyVoice?: boolean;
  firstRequest?: boolean;
};

const encodeVideoTranslateRequest = (
  opts: VideoTranslateOptions,
  deviceId: string
) => {
  // Check if the URL is a direct MP4 file
  // const isDirectMp4 = opts.url.toLowerCase().includes(".mp4");

  // Build translationHelp array
  const translationHelp: { target: TranslationHelp; targetUrl: string }[] = [];
  if (opts.subtitlesFileUrl) {
    translationHelp.push({
      target: TranslationHelp.SubtitlesFileUrl,
      targetUrl: opts.subtitlesFileUrl,
    });
  }
  // For direct MP4 files, add the video URL to translationHelp
  if (opts.videoFileUrl) {
    translationHelp.push({
      target: TranslationHelp.VideoFileUrl,
      targetUrl: opts.videoFileUrl,
    });
  }
  // Note: For direct MP4 files, we don't add to translationHelp
  // The API should be able to handle them via the url field directly

  const requestData: any = {
    url: opts.url,
    // deviceId: deviceId,
    firstRequest: opts.firstRequest ?? true,
    unknown0: 1,
    // language: "en",
    ...(opts.sourceLanguage && { language: opts.sourceLanguage }),
    // Keep forceSourceLang false for better compatibility
    forceSourceLang: false,
    unknown1: 0,
    translationHelp,
    wasStream: false,
    responseLanguage: opts.targetLanguage, // YANDEX_VIDEO_TRANSLATE_LANGUAGES
    unknown2: 1,
    unknown3: 2,
    bypassCache: false,
    useLivelyVoice: opts.useLivelyVoice ?? false,
    videoTitle: "",
  };

  // console.log("encoding video translate request", JSON.stringify(requestData, null, 2));

  return VideoTranslateRequestProto.encode(requestData).finish();
};

enum VideoTranslationStatus {
  FAILED = 0,
  FINISHED = 1,
  WAITING = 2,
  LONG_WAITING = 3,
  PART_CONTENT = 5,
  // Probably the public IP address gets throttled or blocked
  AUDIO_REQUESTED = 6,
  // Unauthorized error for live voice translation
  // when no active yandex session is provided (oauth access token)
  UNAUTHORIZED = 7,
}

export type VideoTranslateResponse = {
  url: string;
  duration: number;
  status: VideoTranslationStatus;
  remainingTime?: number;
  code: string;
  language: string;
  message?: string;
};

const decodeVideoTranslateResponse = (
  response: Uint8Array
  // Iterable<number>
) => {
  return VideoTranslateResponseProto.decode(
    response
    // new Uint8Array(response)
  ) as any as VideoTranslateResponse;
};

// const getRandomValues = (array: Uint8Array) => {
//   for (let i = 0; i < array.length; i++) {
//     array[i] = Math.floor(Math.random() * 256);
//   }
//   return array;
// };

// const generateUuid = () => {
//   return crypto.randomUUID();
// };

let cachedSessionContext: {
  uuid: string;
  secretKey: string;
  expiresAt: number;
} | null = null;
const getSession = async (module = "video-translation", hmacKeyRaw: string) => {
  if (
    cachedSessionContext &&
    cachedSessionContext.expiresAt > Date.now() / 1000 + 60
  ) {
    return cachedSessionContext;
  }

  const utf8Encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    utf8Encoder.encode(hmacKeyRaw),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );

  const uuid = crypto.randomUUID().replace(/-/g, "").toUpperCase();
  const body = YandexSessionRequestProto.encode({ uuid, module }).finish();
  const sigBuffer = await crypto.subtle.sign("HMAC", key, body);
  const sig = Array.prototype.map
    .call(new Uint8Array(sigBuffer), (x) => x.toString(16).padStart(2, "0"))
    .join("");

  const res = await axios({
    url: "https://api.browser.yandex.ru/session/create",
    method: "POST",
    headers: {
      Accept: "application/x-protobuf",
      "Content-Type": "application/x-protobuf",
      "User-Agent": YANDEX_BROWSER_USER_AGENT,
      "Vtrans-Signature": sig,
      ...(YANDEX_COOKIES_HEADER_STRING
        ? { Cookie: YANDEX_COOKIES_HEADER_STRING }
        : {}),
    },
    responseType: "arraybuffer",
    data: Buffer.from(body),
  });

  const decoded: any = YandexSessionResponseProto.decode(
    new Uint8Array(res.data)
  );

  cachedSessionContext = {
    uuid,
    secretKey: decoded.secretKey,
    expiresAt: Date.now() / 1000 + decoded.expires,
  };
  return cachedSessionContext;
};

const translateVideoRequest = async (opts: VideoTranslateOptions) => {
  const utf8Encoder = new TextEncoder();
  const videoTranslateHmacKey = await crypto.subtle.importKey(
    "raw",
    utf8Encoder.encode(YANDEX_TRANSLATE_HMAC_SHA254_SECRET),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign", "verify"]
  );

  const session = await getSession(
    "video-translation",
    YANDEX_TRANSLATE_HMAC_SHA254_SECRET as string
  );
  const deviceId = session.uuid;
  const vtransTokenUUID = session.uuid;

  const videoTranslateRequest = encodeVideoTranslateRequest(opts, deviceId);

  const videoTranslateSignature = await crypto.subtle.sign(
    "HMAC",
    videoTranslateHmacKey,
    videoTranslateRequest
  );

  // const signature = CryptoJS.HmacSHA256(
  //   decoder.decode(body),
  //   // utf8Encoder.encode(
  //   YANDEX_TRANSLATE_HMAC_SHA254_SECRET
  //   // )
  // ).toString(CryptoJS.enc.Hex);

  // const hmac = crypto.createHmac(
  //   "sha256",
  //   utf8Encoder.encode(YANDEX_TRANSLATE_HMAC_SHA254_SECRET)
  // );
  // hmac.update(body);
  // const signature = hmac.digest();

  // console.log("signature", signature);

  const vtransSignature = Array.prototype.map
    .call(new Uint8Array(videoTranslateSignature), (x) =>
      // Encode every byte into hexadecimal system
      x.toString(16).padStart(2, "0")
    )
    .join("");
  // console.log("vtransSignature", vtransSignature);

  const vtransPath = new URL(YANDEX_VIDEO_TRANSLATE_URL).pathname;
  const vtransTokenString = `${vtransTokenUUID}:${vtransPath}:${YANDEX_BROWSER_VERSION}`;

  const vtransTokenSignature = await crypto.subtle.sign(
    "HMAC",
    videoTranslateHmacKey,
    utf8Encoder.encode(vtransTokenString)
  );

  const vtransTokenHex = Array.prototype.map
    .call(new Uint8Array(vtransTokenSignature), (x) =>
      x.toString(16).padStart(2, "0")
    )
    .join("");

  const vtransToken = `${vtransTokenHex}:${vtransTokenString}`;
  // console.log("vtransToken", vtransToken);

  const vtransSk = session.secretKey;

  const videoTranslateResponse = await axios<Uint8Array>({
    url: YANDEX_VIDEO_TRANSLATE_URL,
    method: "POST",
    headers: {
      Accept: "application/x-protobuf",
      "Accept-Language": "en",
      "Content-Type": "application/x-protobuf",
      "User-Agent": YANDEX_BROWSER_USER_AGENT,
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      "Sec-Fetch-Mode": "no-cors",
      "sec-ch-ua": `"Chromium";v="142", "YaBrowser";v="25.12", "Not_A Brand";v="99", "Yowser";v="2.5"`,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": `"macOS"`,
      "Vtrans-Signature": vtransSignature,
      "Sec-Vtrans-Token": vtransToken,
      "Sec-Vtrans-Sk": vtransSk,
      ...(YANDEX_COOKIES_HEADER_STRING
        ? { Cookie: YANDEX_COOKIES_HEADER_STRING }
        : {}),
      ...(opts.useLivelyVoice
        ? YANDEX_OAUTH_ACCESS_TOKEN
          ? // The token is required for the translation of the video with the voice of the original speaker (lively voice) cuz of high resource usage.
            { Authorization: `OAuth ${YANDEX_OAUTH_ACCESS_TOKEN}` }
          : {
              /* Authorization: `Session ${vtransTokenUUID}` */
            }
        : {}),
    },
    // withCredentials: false,
    responseType: "arraybuffer",
    data: Buffer.from(videoTranslateRequest),
  });

  return videoTranslateResponse.data;
};

type VideoTranslateErrorOptions = ErrorOptions & {
  data?: VideoTranslateResponse;
};

export class TranslateException extends Error {
  data?: VideoTranslateResponse;

  constructor(message?: string, options?: VideoTranslateErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
    this.data = options?.data;
  }
}

export class TranslateInProgressException extends TranslateException {
  constructor(...args: ConstructorParameters<typeof TranslateException>) {
    super(...args);
    this.name = this.constructor.name;
  }
}

export const translateVideo = async (
  url: string,
  opts?: Omit<VideoTranslateOptions, "url">
) => {
  const videoTranslateResponse = await translateVideoRequest({
    ...opts,
    url,
  });
  const videoTranslateResponseData = decodeVideoTranslateResponse(
    videoTranslateResponse
  );
  // console.log("Video translate response data:", videoTranslateResponseData);
  logger.info(
    "Video translate response status:",
    videoTranslateResponseData.status
  );

  const translateErrorOptions = { data: videoTranslateResponseData };
  switch (videoTranslateResponseData.status) {
    case VideoTranslationStatus.FAILED:
      throw new TranslateException(
        videoTranslateResponseData.message || "Translation failed",
        translateErrorOptions
      );
    case VideoTranslationStatus.FINISHED:
    case VideoTranslationStatus.PART_CONTENT:
      // FINISHED or PART_CONTENT - both indicate successful translation with available content
      const hasUrl =
        videoTranslateResponseData.url !== undefined &&
        videoTranslateResponseData.url !== null;
      if (hasUrl) {
        return videoTranslateResponseData;
      }
      throw new TranslateException(
        "Audio link not received",
        translateErrorOptions
      );
    case VideoTranslationStatus.WAITING:
    case VideoTranslationStatus.LONG_WAITING:
    case VideoTranslationStatus.AUDIO_REQUESTED:
      // WAITING, LONG_WAITING, AUDIO_REQUESTED statuses indicate translation is in progress
      throw new TranslateInProgressException(
        "Translation is in progress...",
        translateErrorOptions
      );
    case VideoTranslationStatus.UNAUTHORIZED:
      // Status 7 (UNAUTHORIZED) is observed when live voice translation fails (likely auth)
      if (!YANDEX_OAUTH_ACCESS_TOKEN) {
        logger.error(
          "SESSION ERROR: Yandex returned status 7 (UNAUTHORIZED), but YANDEX_OAUTH_ACCESS_TOKEN is missing. " +
            "A valid OAuth token is required for voice translation of this video."
        );
      } else {
        logger.error(
          "SESSION ERROR: Yandex returned status 7 (UNAUTHORIZED), but YANDEX_OAUTH_ACCESS_TOKEN is provided. " +
            "This may be due to an invalid or expired OAuth token."
        );
      }
      throw new TranslateException(
        "Live voice translation not authorized or failed (status 7)",
        translateErrorOptions
      );
    default:
      throw new TranslateException(
        "Unknown translation error",
        translateErrorOptions
      );
  }
};
