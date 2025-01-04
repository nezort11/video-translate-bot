// @ts-nocheck
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

type VideoTranslateResponse = {
  url: string;
  duration: number;
  status: number;
  code: string;
  message?: string;
};

const videoTranslateRequestProto = new protobuf.Type("VideoTranslateRequest")
  .add(new protobuf.Field("url", 3, "string"))
  .add(new protobuf.Field("deviceId", 4, "string"))
  .add(new protobuf.Field("unknown0", 5, "int32"))
  .add(new protobuf.Field("unknown1", 6, "fixed64"))
  .add(new protobuf.Field("unknown2", 7, "int32"))
  .add(new protobuf.Field("language", 8, "string"))
  .add(new protobuf.Field("unknown3", 9, "int32"))
  .add(new protobuf.Field("unknown4", 10, "int32"));

const videoTranslateResponseProto = new protobuf.Type("VideoTranslateResponse")
  .add(new protobuf.Field("url", 1, "string"))
  .add(new protobuf.Field("duration", 2, "double"))
  .add(new protobuf.Field("status", 4, "int32"))
  .add(new protobuf.Field("code", 7, "string"))
  .add(new protobuf.Field("message", 9, "string"));

new protobuf.Root()
  .define("yandex")
  .add(videoTranslateRequestProto)
  .add(videoTranslateResponseProto);

const getEncodedVideoTranslateRequest = (url: string, deviceId: string) => {
  return videoTranslateRequestProto
    .encode({
      url: url,
      deviceId: deviceId,
      unknown0: 1,
      unknown1: parseInt("0x4075500000000000", 16),
      unknown2: 1,
      // language: "en",
      unknown3: 0,
      unknown4: 0,
    })
    .finish();
};

const getDecodedVideoTranslateResponse = (
  response: Uint8Array
  // Iterable<number>
) => {
  return videoTranslateResponseProto.decode(
    response
    // new Uint8Array(response)
  ) as Message & VideoTranslateResponse;
};

// const getRandomValues = (array: Uint8Array) => {
//   for (let i = 0; i < array.length; i++) {
//     array[i] = Math.floor(Math.random() * 256);
//   }
//   return array;
// };

const getUuid = () => {
  const uuid = `${1e7}${1e3}${4e3}${8e3}${1e11}`.replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16)
  );
  return uuid;
};

const getVideoTranslateResponse = async (url: string) => {
  const deviceId = getUuid();

  // console.log("url", url);

  const body = getEncodedVideoTranslateRequest(url, deviceId);

  // console.log("body", body);

  // const decoder = new TextDecoder();
  const utf8Encoder = new TextEncoder();

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    utf8Encoder.encode(YANDEX_TRANSLATE_HMAC_SHA254_SECRET),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign", "verify"]
  );
  const signature = await crypto.subtle.sign("HMAC", hmacKey, body);

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
    .call(new Uint8Array(signature), (x) => x.toString(16).padStart(2, "0"))
    .join("");

  // console.log("vtransSignature", vtransSignature);

  const vtransToken = getUuid().toUpperCase();

  // console.log("vtransToken", vtransToken);

  const data = String.fromCharCode.apply(null, Array.from(body));

  // console.log("data", data);

  const response = await axios({
    url: YANDEX_VIDEO_TRANSLATE_URL,
    method: "post",
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
    withCredentials: true,
    responseType: "arraybuffer",
    data,
  });

  return response.data;
};

export class TranslateException extends Error {
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, TranslateException.prototype);
  }
}

export class TranslateInProgressException {}

export const translateVideo = async (url: string) => {
  const videoTranslateResponse = await getVideoTranslateResponse(url);
  const videoTranslateResponseData = getDecodedVideoTranslateResponse(
    videoTranslateResponse
  );
  // console.log("translateResponse", translateResponse);

  switch (videoTranslateResponseData.status) {
    case 0:
      throw new TranslateException(videoTranslateResponseData.message);
    case 1:
      const hasUrl =
        videoTranslateResponseData.url !== undefined &&
        videoTranslateResponseData.url !== null;
      if (hasUrl) {
        return videoTranslateResponseData.url;
      }
      // Audio link hasn't been received
      throw new TranslateException();
    case 2:
      throw new TranslateInProgressException();
    default:
      throw new TranslateException();
  }
};
