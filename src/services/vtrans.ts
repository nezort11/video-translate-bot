/*
  Credit: https://github.com/FOSWLY/vot-cli
  Requirements: Node.js 18+ (crypto), protobufjs, axios
 */

import protobuf, { Message } from "protobufjs";
import crypto from "crypto";
import axios from "axios";
import { YANDEX_TRANSLATE_HMAC_SHA254_SECRET } from "../env";

const YANDEX_VIDEO_TRANSLATE_URL =
  "https://api.browser.yandex.ru/video-translation/translate";
const YANDEX_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 YaBrowser/24.1.0.0 Safari/537.36";

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
  .add(new protobuf.Field("unknown2", 7, "int32")) // 1 1
  .add(new protobuf.Field("language", 8, "string")) // source language code
  .add(new protobuf.Field("unknown3", 9, "int32")) // 0 - without translationHelp | 1 - with translationHelp (??? But it works without it)
  .add(new protobuf.Field("unknown4", 10, "int32")) // 0 0
  .add(
    new protobuf.Field(
      "translationHelp",
      11,
      "VideoTranslationHelpObject",
      "repeated"
    )
  ) // array for translation assistance ([0] -> {2: link to video, 1: "video_file_url"}, [1] -> {2: link to subtitles, 1: "subtitles_file_url"})
  .add(new protobuf.Field("responseLanguage", 14, "string")) // YANDEX_VIDEO_TRANSLATE_LANGUAGES
  .add(new protobuf.Field("unknown5", 15, "int32")) // 0
  .add(new protobuf.Field("unknown6", 16, "int32")) // 1
  .add(new protobuf.Field("bypassCache", 17, "bool")); // they have some kind of limiter on requests from one IP - because after one such request it stops working

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

new protobuf.Root()
  .define("yandex")
  .add(VideoTranslationHelpObjectProto)
  .add(VideoTranslateRequestProto)
  .add(VideoTranslateResponseProto);

enum TranslationHelp {
  VideoFileUrl = "video_file_url",
  SubtitlesFileUrl = "subtitles_file_url",
}

type VideoTranslateOptions = {
  url: string;
  targetLanguage?: string;

  videoFileUrl?: string;
  subtitlesFileUrl?: string;
};

const encodeVideoTranslateRequest = (opts: VideoTranslateOptions) => {
  console.log("encoding video translate request", opts);
  return VideoTranslateRequestProto.encode({
    url: opts.url,
    // deviceId: deviceId,
    firstRequest: true,
    unknown1: parseInt("0x4075500000000000", 16),
    unknown2: 1,
    // language: "en",
    // unknown3: 0,
    unknown3: 0,
    unknown4: 0,
    translationHelp:
      opts.videoFileUrl && opts.subtitlesFileUrl
        ? [
            {
              target: TranslationHelp.SubtitlesFileUrl,
              targetUrl: opts.subtitlesFileUrl,
            },

            {
              target: TranslationHelp.VideoFileUrl,
              targetUrl: opts.videoFileUrl,
            },
          ]
        : [],
    responseLanguage: opts.targetLanguage, // YANDEX_VIDEO_TRANSLATE_LANGUAGES
    // bypassCache: true,
  }).finish();
};

enum VideoTranslationStatus {
  FAILED = 0,
  FINISHED = 1,
  WAITING = 2,
  LONG_WAITING = 3,
  PART_CONTENT = 5,
  AUDIO_REQUESTED = 6,
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

const generateUuid = () => {
  const uuid = `${1e7}${1e3}${4e3}${8e3}${1e11}`.replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16)
  );
  return uuid;
};

const translateVideoRequest = async (opts: VideoTranslateOptions) => {
  // const deviceId = generateUuid();
  const videoTranslateRequest = encodeVideoTranslateRequest(opts);

  // const decoder = new TextDecoder();
  const utf8Encoder = new TextEncoder();
  const videoTranslateHmacKey = await crypto.subtle.importKey(
    "raw",
    utf8Encoder.encode(YANDEX_TRANSLATE_HMAC_SHA254_SECRET),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign", "verify"]
  );
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

  const vtransToken = generateUuid().toUpperCase();
  // console.log("vtransToken", vtransToken);

  const videoTranslateRequestUtf16Encoded = String.fromCharCode.apply(
    null,
    Array.from(videoTranslateRequest)
  );

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
      "sec-ch-ua": null,
      "sec-ch-ua-mobile": null,
      "sec-ch-ua-platform": null,
      "Vtrans-Signature": vtransSignature,
      "Sec-Vtrans-Token": vtransToken,
    },
    // withCredentials: false,
    responseType: "arraybuffer",
    data: videoTranslateRequestUtf16Encoded,
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
  console.log("videoTranslateResponseData", videoTranslateResponseData);

  const translateErrorOptions = { data: videoTranslateResponseData };
  switch (videoTranslateResponseData.status) {
    case 0:
      throw new TranslateException(
        videoTranslateResponseData.message || "Translation failed",
        translateErrorOptions
      );
    case 1:
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
    case 2:
      throw new TranslateInProgressException(
        "Translation is in progress...",
        translateErrorOptions
      );
    default:
      throw new TranslateException(
        "Unknown translation error",
        translateErrorOptions
      );
  }
};
