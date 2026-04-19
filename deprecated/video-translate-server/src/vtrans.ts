// @ts-nocheck
/*
  Credit: https://github.com/FOSWLY/vot-cli
  Requirements: Node.js 18+ (crypto), protobufjs, axios
 */

import protobuf from "protobufjs";
import crypto from "crypto";
import axios from "axios";
import { YANDEX_TRANSLATE_HMAC_SHA254_SECRET } from "./env";

const YANDEX_VIDEO_TRANSLATE_URL =
  "https://api.browser.yandex.ru/video-translation/translate";
const YANDEX_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 YaBrowser/24.4.0.0 Safari/537.36";

export type VideoTranslateResponse = {
  url: string;
  duration: number;
  status: number;
  code: string;
  message?: string;
};

const VideoTranslationHelpObjectProto = new protobuf.Type(
  "VideoTranslationHelpObject"
)
  .add(new protobuf.Field("target", 1, "string"))
  .add(new protobuf.Field("targetUrl", 2, "string"));

const VideoTranslateRequestProto = new protobuf.Type("VideoTranslationRequest")
  .add(new protobuf.Field("url", 3, "string"))
  .add(new protobuf.Field("deviceId", 4, "string"))
  .add(new protobuf.Field("firstRequest", 5, "bool"))
  .add(new protobuf.Field("duration", 6, "double"))
  .add(new protobuf.Field("unknown0", 7, "int32"))
  .add(new protobuf.Field("language", 8, "string"))
  .add(new protobuf.Field("forceSourceLang", 9, "bool"))
  .add(new protobuf.Field("unknown1", 10, "int32"))
  .add(
    new protobuf.Field(
      "translationHelp",
      11,
      "VideoTranslationHelpObject",
      "repeated"
    )
  )
  .add(new protobuf.Field("wasStream", 13, "bool"))
  .add(new protobuf.Field("responseLanguage", 14, "string"))
  .add(new protobuf.Field("unknown2", 15, "int32"))
  .add(new protobuf.Field("unknown3", 16, "int32"))
  .add(new protobuf.Field("bypassCache", 17, "bool"))
  .add(new protobuf.Field("useLivelyVoice", 18, "bool"))
  .add(new protobuf.Field("videoTitle", 19, "string"));

const VideoTranslateResponseProto = new protobuf.Type(
  "VideoTranslationResponse"
)
  .add(new protobuf.Field("url", 1, "string"))
  .add(new protobuf.Field("duration", 2, "double"))
  .add(new protobuf.Field("status", 4, "int32"))
  .add(new protobuf.Field("remainingTime", 5, "int32"))
  .add(new protobuf.Field("code", 7, "string"))
  .add(new protobuf.Field("language", 8, "string"))
  .add(new protobuf.Field("message", 9, "string"));

new protobuf.Root()
  .define("yandex")
  .add(VideoTranslationHelpObjectProto)
  .add(VideoTranslateRequestProto)
  .add(VideoTranslateResponseProto);

type VideoTranslateOptions = {
  url: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  videoFileUrl?: string;
  subtitlesFileUrl?: string;
  useLivelyVoice?: boolean;
  firstRequest?: boolean;
};

const encodeVideoTranslateRequest = (
  opts: VideoTranslateOptions,
  deviceId: string
) => {
  const translationHelp = [];
  if (opts.subtitlesFileUrl) {
    translationHelp.push({
      target: "subtitles_file_url",
      targetUrl: opts.subtitlesFileUrl,
    });
  }
  if (opts.videoFileUrl) {
    translationHelp.push({
      target: "video_file_url",
      targetUrl: opts.videoFileUrl,
    });
  }

  return VideoTranslateRequestProto.encode({
    url: opts.url,
    deviceId: deviceId,
    firstRequest: opts.firstRequest ?? true,
    unknown0: 1,
    language: opts.sourceLanguage || "en",
    forceSourceLang: !!opts.sourceLanguage,
    unknown1: 0,
    translationHelp,
    wasStream: false,
    responseLanguage: opts.targetLanguage || "ru",
    unknown2: 1,
    unknown3: 2,
    bypassCache: false,
    useLivelyVoice: opts.useLivelyVoice ?? false,
    videoTitle: "",
  }).finish();
};

const decodeVideoTranslateResponse = (response: Uint8Array) => {
  return VideoTranslateResponseProto.decode(
    response
  ) as any as VideoTranslateResponse;
};

const generateUuid = () => {
  return `${1e7}${1e3}${4e3}${8e3}${1e11}`.replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16)
  );
};

const translateVideoRequest = async (opts: VideoTranslateOptions) => {
  const deviceId = generateUuid();
  const body = encodeVideoTranslateRequest(opts, deviceId);

  const utf8Encoder = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    utf8Encoder.encode(YANDEX_TRANSLATE_HMAC_SHA254_SECRET),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", hmacKey, body);
  const signature = Array.prototype.map
    .call(new Uint8Array(signatureBuffer), (x) =>
      x.toString(16).padStart(2, "0")
    )
    .join("");

  const token = generateUuid().toUpperCase();

  const response = await axios({
    url: YANDEX_VIDEO_TRANSLATE_URL,
    method: "POST",
    headers: {
      Accept: "application/x-protobuf",
      "Accept-Language": "en",
      "Content-Type": "application/x-protobuf",
      "User-Agent": YANDEX_BROWSER_USER_AGENT,
      "Vtrans-Signature": signature,
      "Sec-Vtrans-Token": token,
    },
    responseType: "arraybuffer",
    data: body,
  });

  return response.data;
};

export class TranslateException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "TranslateException";
  }
}

export class TranslateInProgressException {
  constructor() {
    this.name = "TranslateInProgressException";
  }
}

export const translateVideo = async (opts: VideoTranslateOptions) => {
  const response = await translateVideoRequest(opts);
  const data = decodeVideoTranslateResponse(new Uint8Array(response));

  console.log("Translation Response Data:", data);

  switch (data.status) {
    case 0:
      throw new TranslateException(data.message);
    case 1:
    case 5: // PART_CONTENT
      if (data.url) return data;
      throw new TranslateException("Audio link not received");
    case 2:
    case 3:
    case 6:
    case 7:
      throw new TranslateInProgressException();
    default:
      throw new TranslateException(data.message || "Unknown error");
  }
};
