import { BotContext, bot } from "./botinstance";

// import { S3Session } from "telegraf-session-s33";
import i18next, { TFunction } from "i18next";
import Backend from "i18next-fs-backend";
import yaml from "js-yaml";
// import Database from "better-sqlite3";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { Composer, Context, Markup, TelegramError, session } from "telegraf";
// import { SQLite } from "@telegraf/session/sqlite";

import { message } from "telegraf/filters";
import { Stage, WizardScene } from "telegraf/scenes";
import { KeyedDistinct } from "telegraf/typings/core/helpers/util";
import axios, { AxiosError } from "axios";
import { load } from "cheerio";
// import { getAudioDurationInSeconds } from "get-audio-duration";
// import { getVideoDurationInSeconds } from "get-video-duration";
import path from "path";
import fs from "fs/promises";
import fss from "fs";
import ytdl from "@distube/ytdl-core";
// import { createFFmpeg } from "@ffmpeg/ffmpeg";
import ffmpeg, { FfprobeData } from "fluent-ffmpeg";
import http from "http";
import https from "https";
import { Api } from "telegram";
// import translate from "@iamtraction/google-translate";
import * as Sentry from "@sentry/node";
import moment from "moment";
import { inspect } from "util";
// import { TimeoutError } from "p-timeout";
import _ from "lodash";
const { capitalize } = _;
// @ts-ignore
import { VideoTranslateResponse } from "./services/vtrans";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

// import {
//   TranslateException,
//   TranslateInProgressException,
//   // translateVideo,
// } from "./translate";
import {
  NoOpenTelegramSessionError,
  delegateDownloadLargeFile,
  getClient,
  useTelegramClient,
} from "./telegramclient";
import { logger } from "./logger";

import {
  OWNER_USERNAME,
  SENTRY_DSN,
  VIDEO_TRANSLATE_APP_URL,
  APP_ENV,
  STORAGE_DIR_PATH,
  MOUNT_ROOT_DIR_PATH,
  YDB_ENDPOINT,
  YDB_DATABASE,
  LAMBDA_TASK_ROOT,
  WORKER_BOT_SERVER_WEBHOOK_URL,
  LOGGING_CHANNEL_CHAT_ID,
  OPENAI_API_BASE_URL,
  OPENAI_API_KEY,
  EXECUTION_TIMEOUT,
} from "./env";
import {
  telegramLoggerContext,
  telegramLoggerIncomingMiddleware,
  telegramLoggerOutgoingMiddleware,
} from "./telegramlogger";
// import { botThrottler, translateThrottler } from "./throttler";
import { escapeHtml, formatDuration, importPTimeout } from "./utils";
import { InlineKeyboardButton, Message, Update } from "telegraf/types";
import {
  TranslateException,
  TranslateInProgressException,
  YANDEX_VIDEO_TRANSLATE_LANGUAGES,
  translateVideo,
} from "./services/vtrans";
import {
  VideoPlatform,
  getVideoInfo,
  getVideoPlatform,
  getYoutubeVideoId,
  getVideoThumbnail,
  translateText,
  isValidUrl,
  getLinkMatch,
  uploadVideo,
} from "./core";
import {
  downloadVideo,
  // downloadYoutubeVideo,
  // ytdlAgent,
} from "./services/ytdl";
import { translate } from "./services/translate";
import { updatesTable } from "./schema";
import {
  ActionType,
  Router,
  Screen,
  createActionButton,
  createRouter,
  decodeActionPayload,
  encodeActionPayload,
  getActionData,
  getRouter,
  getRouterSessionData,
  setActionData,
  setRouterSessionData,
} from "./actions";
import { driver, sessionStore, trackUpdate } from "./db";
import { PassThrough, Readable } from "stream";

type Hideable<B> = B & { hide: boolean };

// const database = new Database(path.join(STORAGE_DIR_PATH, "db.sqlite"));
// database.pragma("journal_mode = WAL"); // Helps prevent corruption https://chatgpt.com/c/67ab8ae9-bf14-8012-9c4a-3a12d682cb1d

// https://orm.drizzle.team/docs/get-started-sqlite#better-sqlite3
// const db = drizzle({ client: database });

const getAudioDurationInSeconds: any = {};
const getVideoDurationInSeconds: any = {};
// const ytdl: any = {};

const AXIOS_REQUEST_TIMEOUT = moment.duration(45, "minutes").asMilliseconds();

const messageTextNotCommand = (
  update: Update
): update is Update.MessageUpdate<KeyedDistinct<Message, "text">> => {
  if (!("message" in update)) return false;
  if (!("text" in update.message)) return false;
  if ("text" in update.message && update.message.text.startsWith("/"))
    return false;

  return true;
};

const axiosInstance = axios.create({
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

Sentry.init({
  dsn: SENTRY_DSN,

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
});

type UploadResponse = {
  chat_id: string;
  message_id: number;
};

const ERROR_MESSAGE_IS_NOT_MODIFIED =
  "Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message";

const ERROR_MESSAGE_CANT_BE_EDITED =
  "400: Bad Request: message can't be edited";

const ERROR_MESSAGE_TO_EDIT_NOT_FOUND =
  "400: Bad Request: message to edit not found";

const ERROR_FORBIDDEN_BOT_WAS_BLOCKED_BY_THE_USER =
  "403: Forbidden: bot was blocked by the user";

const getLinkTitle = async (link: string) => {
  try {
    const resourceResponse = await axiosInstance.get(link);
    const $ = load(resourceResponse.data);
    let title = $("title").text();

    // if (title.endsWith("YouTube")) {
    //   title = title.split(" - YouTube")[0];
    // }

    // logger.info(`Title is: ${title}`);
    return title;
  } catch (error) {
    logger.warn("Unable to get website title:", error);
    Sentry.captureException(error);
    return;
  }
};

const shortenYoutubeLink = (youtubeVideoId: string) =>
  `https://youtu.be/${youtubeVideoId}`;

const buildGoogleSearchVideosUrl = (query: string) => {
  const googleUrl = new URL("https://www.google.com/search");
  googleUrl.searchParams.set("q", query);
  googleUrl.searchParams.set("safe", "off");
  googleUrl.searchParams.set("hl", "en");
  googleUrl.searchParams.set("udm", "7"); // "Videos" section
  return googleUrl.href;
};

const buildYoutubeSearchUrl = (query: string) => {
  const youtubeSearchUrl = new URL("https://www.youtube.com/results");
  youtubeSearchUrl.searchParams.set("search_query", query);
  return youtubeSearchUrl.href;
};

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout((_) => resolve(undefined), milliseconds));

const TRANSLATE_PULLING_INTERVAL = moment
  .duration(15, "seconds")
  .asMilliseconds();

// const translateVideo = async (url: string) => {
//   return await axios.post<VideoTranslateResponse>(
//     VIDEO_TRANSLATE_API_URL,
//     null,
//     { params: { url } }
//   );
// };

const languageToFlag = {
  ru: "🇷🇺", // Russian - Russia
  en: "🇺🇸", // English - United States
  ir: "🇮🇷", // Persian - Iran
  uz: "🇺🇿", // Uzbek - Uzbekistan
  id: "🇮🇩", // Indonesian - Indonesia
  es: "🇪🇸", // Spanish - Spain
  de: "🇩🇪", // German - Germany
  it: "🇮🇹", // Italian - Italy
  fr: "🇫🇷", // French - France
  pt: "🇵🇹", // Portuguese - Portugal
  pt_br: "🇧🇷", // Portuguese - Brazil
  uk: "🇺🇦", // Ukrainian - Ukraine
  tr: "🇹🇷", // Turkish - Turkey
  pl: "🇵🇱", // Polish - Poland
  nl: "🇳🇱", // Dutch - Netherlands
  ja: "🇯🇵", // Japanese - Japan
  zh: "🇨🇳", // Chinese - China (Simplified)
  zh_hant: "🇹🇼", // Chinese - Taiwan (Traditional)
  ar: "🇸🇦", // Arabic - Saudi Arabia
  he: "🇮🇱", // Hebrew - Israel
  hi: "🇮🇳", // Hindi - India
  ko: "🇰🇷", // Korean - South Korea
  sv: "🇸🇪", // Swedish - Sweden
  fi: "🇫🇮", // Finnish - Finland
  no: "🇳🇴", // Norwegian - Norway
  da: "🇩🇰", // Danish - Denmark
  cs: "🇨🇿", // Czech - Czech Republic
  el: "🇬🇷", // Greek - Greece
  ro: "🇷🇴", // Romanian - Romania
  hu: "🇭🇺", // Hungarian - Hungary
  th: "🇹🇭", // Thai - Thailand
  my: "🇲🇲", // Burmese - Myanmar
  bd: "🇧🇩", // Bengali - Bangladesh
  pk: "🇵🇰", // Urdu - Pakistan
  eg: "🇪🇬", // Arabic - Egypt
  ph: "🇵🇭", // Filipino - Philippines
  vn: "🇻🇳", // Vietnamese - Vietnam
  tg: "🇹🇯", // Tajik - Tajikistan
  kk: "🇰🇿", // Kazakh - Kazakhstan
  kg: "🇰🇬", // Kyrgyz - Kyrgyzstan
} as const;

const SUPPORTED_TRANSLATE_LANGUAGES = Object.keys(languageToFlag);

const getTranslateLanguage = (context: BotContext) => {
  if (context.session.translateLanguage) {
    return context.session.translateLanguage;
  }

  const lang = context.from?.language_code;
  if (lang && SUPPORTED_TRANSLATE_LANGUAGES.includes(lang)) {
    return lang;
  } else {
    return "en";
  }
};

const DEFAULT_CREDITS_BALANCE = 10; // 10 minutes

const getCurrentBalance = (context: BotContext) => {
  return (context.session.balance ?? 0) + DEFAULT_CREDITS_BALANCE;
};

const translateVideoFinal = async (
  url: string,
  targetLanguage?: string
): Promise<VideoTranslateResponse> => {
  try {
    return await translateVideo(url, { targetLanguage });
    // const videoTranslateResponse = await translateVideo(url);
    // return videoTranslateResponse.data;
  } catch (error) {
    // if (axios.isAxiosError(error)) {
    //   const errorData = error.response?.data;
    //   if (errorData.name === "TranslateInProgressException") {
    //     await delay(TRANSLATE_PULLING_INTERVAL);
    //     logger.info("Rerequesting translation...");
    //     return await translateVideoFinal(url);
    //   }
    //   if (errorData.name === "Error") {
    //     throw new Error(errorData.message, { cause: error });
    //   }
    // }
    // throw error;
    if (error instanceof TranslateInProgressException) {
      await delay(TRANSLATE_PULLING_INTERVAL);
      logger.info("Rerequesting translation...");
      return await translateVideoFinal(url);
    }
    throw error;
  }
};
type TranscribeResult = {
  segments: {
    text: string;
  }[];
};

const transcribe = async (fileBlob: Blob, fileName: string) => {
  const data = new FormData();
  data.append("file", fileBlob, fileName);
  data.append("model", "whisper-1");
  data.append("response_format", "verbose_json");

  const transcriptionResponse = await axios.request<TranscribeResult>({
    method: "post",
    baseURL: OPENAI_API_BASE_URL,
    url: "/v1/audio/transcriptions",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "multipart/form-data",
    },
    data: data,
    responseType: "json",
  });
  const transcription = transcriptionResponse.data;
  return transcription;
};

const joinSsml = (segments: string[]) => {
  const escapeText = (text: string): string => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  let ssml = "<speak>";

  // segments.forEach((segment: any) => {
  for (const segment of segments) {
    // <break time='${(segment.end - segment.start).toFixed(
    //   2
    // )}s'/>
    console.log("trans segment", segment);
    ssml += `<p>${escapeText(
      segment
      // .text
    )}</p>`;
  }

  ssml += "</speak>";
  return ssml;
};

const TEMP_DIR_PATH = "/tmp";

const translateAnyVideo = async (url: string, targetLanguage: string) => {
  console.log("downloading url", url);
  const videoResponse = await fetch(url);
  const videoBlob = await videoResponse.blob();
  console.log("video blob", videoBlob.size);

  const videoUrl = new URL(url);
  const videoFileName = videoUrl.pathname.split("/").pop();

  const transcription = await transcribe(videoBlob, videoFileName!);
  console.log("video file transcribed", transcription.segments.length);

  const translatedSegments = await translate(
    transcription.segments.map((segment) => segment.text),
    targetLanguage
  );

  console.log("requesting speak srt...");
  const transcriptionSsml = joinSsml(
    translatedSegments.translations.map((transSegment) => transSegment.text)
  );
  console.log("transcription ssml", transcriptionSsml);
  const client = new TextToSpeechClient();
  const [synthesizedSpeechResponse] = await client.synthesizeSpeech({
    input: { ssml: transcriptionSsml },
    voice: {
      languageCode: targetLanguage,
      ssmlGender: "NEUTRAL", // Adjust the voice gender if needed (e.g., 'MALE' or 'FEMALE')
    },
    audioConfig: {
      audioEncoding: "MP3",
    },
  });

  const translatedTranscriptionAudio =
    synthesizedSpeechResponse.audioContent as Buffer;
  console.log(
    "translatedTranscriptionAudio length",
    translatedTranscriptionAudio.byteLength
  );
  fss.writeFileSync(
    path.join(TEMP_DIR_PATH, "temptest.mp3"),
    translatedTranscriptionAudio
  );

  return translatedTranscriptionAudio;
};

function toArrayBuffer(buffer: Buffer) {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return arrayBuffer;
}

const percent = (percent: number) => percent / 100;

enum TranslateType {
  Voice = "o",
  Audio = "a",
  Video = "v",
  ChooseVideoQuality = "q",
}

enum TranslateQuality {
  Mp4_360p = "MP4_360P",
  Mp4_720p = "MP4_720P",
}

// https://github.com/fent/node-ytdl-core#ytdlchooseformatformats-options
// https://gist.github.com/kurumigi/e3bad17420afdb81496d37792813aa09
//
// 18 - mp4 audio/video 360p
// 22 - mp4 audio/video 720p
// 37 - mp4 audio/video 1080p
//
// 133 - mp4_dash video 240p
// 134 - mp4_dash video 360p
// 135 - mp4_dash video 480p
// 136 - mp4_dash video 720p
// 137 - mp4_dash video 1080p
//
// 139 - mp4_dash audio 48k
// 140 - mp4_dash audio 128k
// 141 - mp4_dash audio 256k
//
// 395 - mp4_dash video 240p
// 396 - mp4_dash video 360p
// 397 - mp4_dash video 480p
// 398 - mp4_dash video 720p
// 399 - mp4_dash video 1080p
enum YoutubeVideoFormatItag {
  Mp4AvcVideo360p = 134,
  Mp4AvcVideo720p = 136,

  Mp4aAudio48kb = 139,
  Mp4aAudio128kb = 140,
  Mp4aAudio256kb = 141, // not always present in video formats list
}

enum SceneName {
  VideoSearch = "VIDEO_SEARCH",
}

const translateQualityToYoutubeVideoFormatItag = {
  [TranslateQuality.Mp4_360p]: {
    video: YoutubeVideoFormatItag.Mp4AvcVideo360p,
    audio: YoutubeVideoFormatItag.Mp4aAudio128kb,
  },
  [TranslateQuality.Mp4_720p]: {
    video: YoutubeVideoFormatItag.Mp4AvcVideo720p,
    audio: YoutubeVideoFormatItag.Mp4aAudio128kb,
  },
} as const;

type TranslateAction = {
  translateType: TranslateType;
  url: string;
  quality: TranslateQuality;
};

const encodeTranslateAction = (
  translateType: TranslateAction["translateType"],
  url: TranslateAction["url"],
  quality: TranslateAction["quality"]
) => {
  return [translateType, url, quality].join(",");
};

const encodeChooseVideoQualityAction = (url: TranslateAction["url"]) => {
  return `${TranslateType.ChooseVideoQuality}${url}`;
};

const decodeTranslateAction = (actionData: string) => {
  const actionDataDecoded = actionData.split(",");
  return {
    translateType: actionDataDecoded[0],
    url: actionDataDecoded[1],
    quality: actionDataDecoded[2],
  } as TranslateAction;
};

// https://github.com/ffmpegwasm/ffmpeg.wasm/tree/0.11.x
// https://ffmpegwasm.netlify.app/docs/migration
// https://ffmpegwasm.netlify.app/docs/faq#why-ffmpegwasm-doesnt-support-nodejs
// const ffmpeg = createFFmpeg({
//   log: true,
//   logger: ({ message }) => logger.info(message),
//   // corePath: path.resolve("../ffmpeg-dist/ffmpeg-core.js"),
//   // workerPath: path.resolve("../ffmpeg-dist/ffmpeg-core.worker.js"),
//   // wasmPath: path.resolve("../ffmpeg-dist/ffmpeg-core.wasm"),
// });
// const ffmpeg: any = {};

// Store current webhook invocation update
let currentUpdateContext: Context | null = null;

let t: TFunction<"translation", undefined>;

bot.use(async (context, next) => {
  currentUpdateContext = context;
  await next();
});

bot.use(async (context, next) => {
  await i18next.use(Backend).init({
    // Default language
    lng: "en",
    fallbackLng: "en",
    // Preload supported languages
    preload: ["en", "ru"],
    backend: {
      loadPath: path.join(__dirname, "../locales/{{lng}}.yaml"),
      parse: (data) => yaml.load(data), // Use YAML parsing
    },
  });

  let lang = "en";
  // Use the stored language from session if available
  if (context.session?.language) {
    lang = context.session.language;
  } else if (context.from?.language_code === "ru") {
    lang = "ru";
  }

  // Attach a fixed translation function for the detected language
  t = i18next.getFixedT(lang);

  await next();
});

// handle non-fatal (warn) errors
const handleWarnError = (message: string, error: unknown) => {
  logger.warn(message, error);
  Sentry.captureException(new Error(message, { cause: error }), {
    level: "warning",
    // @ts-expect-error user object is serializable
    user: currentUpdateContext?.from,
    // @ts-expect-error update object is serializable
    extra: currentUpdateContext?.update,
  });
};

// Disable bot in group and channel chats (group can be disabled in botfather)
// NOTE: context.chat is not always present in the update (e.g. pre_checkout_query)
bot.use(
  Composer.drop(
    (context) => (context.chat && context.chat.type !== "private") ?? false
  )
);

// const s3Session = new S3Session(STORAGE_BUCKET);

// bot.use(s3Session);
// bot.use(Telegraf.log());

// Track all incoming updates (for analytics purposes)
bot.use(async (context, next) => {
  if (APP_ENV !== "local") {
    // Save incoming update (async)
    logger.log(`Saving update id ${context.update.update_id}`);
    trackUpdate(context.update);
  }

  await next();
});

// Provide a session storage provider
// const sessionDb = new Database(path.join(STORAGE_DIR_PATH, "session.sqlite"));
// sessionDb.pragma("journal_mode = WAL"); // Helps prevent corruption
// const sessionStore = SQLite<{}>({ database: sessionDb });
// bot.use(session({ store: sessionStore }));

bot.use(
  session({
    store: sessionStore,
    // make sure session is never undefined
    defaultSession: () => ({}),
  })
);

const replyError = (
  context: Context,
  ...replyArgs: Parameters<typeof Context.prototype.reply>
) => {
  replyArgs[0] = `⚠️  ${replyArgs[0]}`;
  return context.reply(...replyArgs);
};

const handleError = async (error: unknown, context: Context) => {
  if (typeof error === "object" && error !== null) {
    if (
      "message" in error &&
      error.message === ERROR_FORBIDDEN_BOT_WAS_BLOCKED_BY_THE_USER
    ) {
      logger.warn(error);
      return;
    }
    const { TimeoutError } = await importPTimeout();
    // p-timeout error thrown by telegraf based on `handlerTimeout`
    if ("name" in error && error.name === TimeoutError.name) {
      await replyError(context, t("translation_failed"));
      return;
    }

    if (error instanceof NoOpenTelegramSessionError) {
      await replyError(context, t("system_capacity_reached"));
      return;
    }
  }

  logger.error(error);

  if (APP_ENV !== "local") {
    Sentry.captureException(error);
  }

  await replyError(context, t("error_retry"));
  if (APP_ENV !== "local") {
    try {
      await telegramLoggerContext.reply(
        `<code>${escapeHtml(inspect(error))}</code>`,
        {
          parse_mode: "HTML",
        }
      );
    } catch (error) {
      console.warn("Error while sending error inspect", error);
    }
  }
};

const handleTranslateInProgress = async (
  context: Context,
  progress: number
) => {
  try {
    // await context.editMessageText(
    //   `⏳ Видео в процессе перевода, обработка может занять до нескольких часов... (прогресс ${Math.floor(
    //     progress * 100
    //   )}%)`
    // );
    await context.editMessageText(t("translation_in_progress"));
  } catch (error) {
    if (error instanceof TelegramError) {
      if (
        error.response.description === ERROR_MESSAGE_IS_NOT_MODIFIED || // pass
        error.response.description === ERROR_MESSAGE_CANT_BE_EDITED || // skip until message is editable
        error.response.description === ERROR_MESSAGE_TO_EDIT_NOT_FOUND // after message is deleted and promise is not completed
      ) {
        // pass
      }
    } else {
      throw error;
    }
  }
};

// bot.use(botThrottler);

// bot.use(
//   Composer.optional((context) => !!context.callbackQuery, translateThrottler)
// );

bot.use(async (context, next) => {
  // Telegraf: "sendChatAction" isn't available for "pre_checkout_query"
  if (context.updateType === "pre_checkout_query") {
    await next();
  } else {
    await context.persistentChatAction("typing", async () => {
      await next();
    });
  }

  // let typingInterval: NodeJS.Timer | undefined;
  // try {

  //   await context.persistentChatAction('typing')
  //   await context.sendChatAction("typing");
  //   typingInterval = setInterval(async () => {
  //     try {
  //       // await Promise.allSettled([
  //       //   context.sendChatAction("typing"),
  //       //   ...(context.chat && context.chat.id !== +DEBUG_USER_CHAT_ID
  //       //     ? [context.telegram.sendChatAction(DEBUG_USER_CHAT_ID, "typing")]
  //       //     : []),
  //       // ]);
  //       console.log("sending chat action...");
  //       await context.sendChatAction("typing");
  //     } catch (error) {
  //       console.log("error while sending chat action...:", error);
  //       clearInterval(typingInterval);

  //       await handleError(error, context);
  //     }
  //   }, moment.duration(5, "seconds").asMilliseconds());

  //   console.log("awaiting next...");
  //   await next();
  //   console.log("ended awaiting next");
  // } finally {
  //   clearInterval(typingInterval);
  //   // no way to clear chat action, wait 5s
  // }
});

// Disable message logging locally
if (APP_ENV !== "local") {
  bot.use(telegramLoggerIncomingMiddleware);

  bot.use(telegramLoggerOutgoingMiddleware);
}

bot.catch(async (error, context) => {
  await handleError(error, context);
});

// const START_MESSAGE = `
// 👋 Привет, пришли мне 🔗 ссылку на видео и я попробую 🚧 перевести его.

// Поддерживаю полноценный перевод 📺 видео с видео-платформ 🌐 youtube.com

// а также перевод 🎤 голоса для
// 🌐 instagram.com, tiktok.com, x.com
// 🇨🇳 bilibili.com, youku.com, v.qq.com, iqiyi.com
// 🇷🇺 vk.com, ok.ru
// и других
// `;

bot.start(async (context) => {
  // const router = createRouter(context, undefined, {});
  await context.reply(
    t("start"),
    //  Я поддерживаю много различных платформ / соцсетей / сайтов, а также простые ссылки для видео / аудио.
    // Перевожу не только с английского, но и с многих других языков"
    { disable_notification: true }
  );
});

// Exit scenes on any /command entered
bot.use(async (ctx, next) => {
  if (
    ctx.message &&
    "text" in ctx.message &&
    ctx.message.text.startsWith("/")
  ) {
    delete ctx.session?.__scenes;
  }

  return await next();
});

bot.command("cancel", async (context) => {
  // delete context.session.__scenes;
  await context.reply(t("dialog_left"), {
    ...Markup.removeKeyboard(),
    disable_notification: true,
  });
});

bot.command("translate", async (context) => {
  await context.reply(t("translate"));
});

const starsAmountToOptionMap = {
  50: {
    credits: 60,
    discount: 0,
  },
  150: {
    credits: 225,
    discount: 25,
  },
  500: {
    credits: 875,
    discount: 45,
  },
};

bot.command("balance", async (context) => {
  const balance = getCurrentBalance(context);
  await context.replyWithHTML(
    t("balance").replace("{balance}", `${balance}`),
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          t("purchase_50"),
          encodeActionPayload({ routerId: "TOPUP", actionId: "50" })
        ),
      ],
      [
        Markup.button.callback(
          t("purchase_150"),
          encodeActionPayload({ routerId: "TOPUP", actionId: "150" })
        ),
      ],
      [
        Markup.button.callback(
          t("purchase_500"),
          encodeActionPayload({ routerId: "TOPUP", actionId: "500" })
        ),
      ],
    ])
  );
});

const videoSearchWizard = new WizardScene<BotContext>(
  SceneName.VideoSearch,
  // .enter()
  async (context) => {
    await context.reply(
      "Для поиска видео на других языках пожалуйста введи необходимый поисковой запрос:"
    );
    return context.wizard.next();
  },
  async (context) => {
    if (context.has(message("text"))) {
      const searchQuery = context.message.text;
      if (searchQuery.length > 100) {
        return await replyError(
          context,
          "Запрос слишком длинный, пожалуйста сделайте короче"
        );
      }

      const translatedTextResult = await translate([searchQuery], "en");
      const translatedText = translatedTextResult.translations[0].text;

      const googleSearchYoutubeVideosUrl = buildGoogleSearchVideosUrl(
        `${translatedText} site:youtube.com`
      );
      const youtubeSearchUrl = buildYoutubeSearchUrl(translatedText);

      await context.reply(
        `🔍 Выполни поиск по запросу ${translatedText} (${searchQuery}).\n*Для перевода, пожалуйста, скопируйте и пришлите 🔗 ссылку на необходимое видео`,
        Markup.inlineKeyboard([
          Markup.button.url("📺 YouTube", youtubeSearchUrl),
          Markup.button.url("🔍 Google", googleSearchYoutubeVideosUrl),
        ])
      );
      await context.scene.leave();
    } else {
      return await replyError(
        context,
        "Пожалуйста, введи необходимый запрос текстом"
      );
    }
  }
);

// Initialize before the .scene is used
const stage = new Stage();
// @ts-expect-error WizardScene is compatible with BaseScene
stage.register(videoSearchWizard);
// @ts-expect-error invalid types
bot.use(stage.middleware());

bot.command("search", async (context) => {
  await context.scene.enter(SceneName.VideoSearch);
});

bot.command("test", async (context) => {
  await context.reply(`Your chat id: ${context.chat.id}`);
  // const youtubeReadableStream = ytdl(
  //   "https://www.youtube.com/watch?v=5weFyMoBGN4"
  //   // { filter: "audio" }
  //   // { filter: "audioonly" }
  // );

  // const translationUrl = await getVoiceTranslateFinal(
  //   "https://www.youtube.com/watch?v=5weFyMoBGN4"
  // );
  // const audioResponse = await axiosInstance.get<ArrayBuffer>(translationUrl, {
  //   responseType: "arraybuffer",
  //   // responseType: "stream",
  // });
  // const audioBuffer = Buffer.from(audioResponse.data);

  // // let ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

  // const streamChunks: Uint8Array[] = [];
  // for await (const data of youtubeReadableStream) {
  //   streamChunks.push(data);
  // }
  // const youtubeBuffer = Buffer.concat(streamChunks);

  // // @ts-expect-error non-standard attribute
  // youtubeBuffer.name = "video.mp4";

  // // await fs.writeFile("./output.mp4", youtubeBuffer);

  // await fs.writeFile("./video.mp4", youtubeBuffer);

  // // const audioStream = audioResponse.data;
  // // const audioStream = Readable.from(audioBuffer);

  // const videoDuration = await getVideoDurationInSeconds("./video.mp4"); // ffprobe-based

  // // await context.replyWithVideo({
  // //   source: youtubeBuffer,
  // //   // source: youtubeBuffer,
  // //   // source: youtubeReadableStream,
  // //   // filename: "audio.mp3",
  // // });

  // // const ffmpeg = createFFmpeg({
  // //   log: true,
  // //   corePath: path.resolve("../ffmpeg-dist/ffmpeg-core.js"),
  // //   workerPath: path.resolve("../ffmpeg-dist/ffmpeg-core.worker.js"),
  // //   wasmPath: path.resolve("../ffmpeg-dist/ffmpeg-core.wasm"),
  // // });
  // if (!ffmpeg.isLoaded()) {
  //   await ffmpeg.load();
  // }

  // ffmpeg.FS("writeFile", "source.mp4", youtubeBuffer);
  // ffmpeg.FS("writeFile", "source2.mp3", audioBuffer);
  // // prettier-ignore
  // await ffmpeg.run(
  //   "-i", "source.mp4",

  //   "-i", "source2.mp3",
  //   "-filter_complex", '[0:a]volume=0.1[a];' + // 20% (25%/30%/35%/40%) original playback
  //                       '[1:a]volume=1[b];' + //  voice over
  //                       '[a][b]amix=inputs=2:dropout_transition=0',  // :duration=longest',

  //   // "-qscale:a", "9", // "4",
  //   // "-codec:a", "libmp3lame", // "aac",
  //   "-b:a", "64k", // decrease output size (MB) - default 128kb
  //   // " -pre", "ultrafast",

  //   "output.mp4"
  // );
  // // ffmpeg -i input.mp4 -f null /dev/null
  // // ffmpeg -i ./input.mp4 -i input2.mp3 -filter_complex "[0:a]volume=0.25[a];[1:a]volume=1[b];[a][b]amix=inputs=2:duration=longest" -c:a libmp3lame -q:a 4 -y output_audio.mp3

  // const outputFile = ffmpeg.FS("readFile", "output.mp4");

  // let outputBuffer: Buffer | null = Buffer.from(outputFile);

  // // @ts-expect-error non-standard attribute
  // outputBuffer.name = "video.mp4";

  // const telegramClient = await getClient();
  // const { id: fileMessageId } = await telegramClient.sendFile(
  //   STORAGE_CHANNEL_CHAT_ID,
  //   {
  //     file: outputBuffer,
  //     // caption: link,
  //     // thumb: path.resolve("./thumb.jpg"),
  //     // thumb: thumbnailBuffer,
  //     // thumb: "/Users/egorzorin/Downloads/response.jpeg",

  //     attributes: [
  //       // new Api.DocumentAttributeAudio({
  //       //   // duration: Math.floor(audioDuration),
  //       //   // title: resourceTitle,
  //       //   // performer: artist,
  //       // }),
  //       // new Api.DocumentAttributeFilename({
  //       //   fileName: "mqdefault.jpg",
  //       // }),
  //       new Api.DocumentAttributeVideo({
  //         // w: 320,
  //         // h: 180,
  //         // w: 16,
  //         // h: 9,
  //         w: 640,
  //         h: 360,
  //         duration: Math.floor(videoDuration),
  //         supportsStreaming: true,
  //       }),
  //     ],
  //   }
  // );

  // await context.telegram.copyMessage(
  //   context.chat.id,
  //   STORAGE_CHANNEL_CHAT_ID,
  //   fileMessageId
  // );

  // await context.replyWithAudio({
  //   source: outputBuffer,
  //   // source: youtubeBuffer,
  //   // source: youtubeReadableStream,
  //   filename: "audio.mp3",
  // });

  // outputBuffer = null;
});

const mockVideoLink = "https://www.youtube.com/watch?v=CcnwFJqEnxU";

bot.command("chatid", async (context) => {
  await context.reply(`Your chat id: ${context.chat.id}`);
});

bot.command("debug_stats", async (context) => {
  // const updates = await db.select({ count: count() }).from(updatesTable);
  // await context.reply(`Total updates: ${updates[0].count}\n` + `Total users:`);

  const tableClient = driver.tableClient;

  let updatesCount: number = 0;
  await tableClient.withSessionRetry(async (session) => {
    const result = await session.executeQuery(
      `SELECT COUNT(*) as count FROM updates;`
    );

    const row = result?.resultSets?.[0]?.rows?.[0];
    if (row) {
      const countValue = row.items?.[0]?.uint64Value;
      if (countValue !== undefined) {
        updatesCount = Number(countValue);
      }
    }
  });

  await context.reply(`Total updates: ${updatesCount}\n` + `Total users:`);
});

bot.command("debug_vtrans", async (context) => {
  logger.info("Request translation...");
  let translationUrl: string; //| undefined;
  try {
    const videoTranslateData = await translateVideoFinal(mockVideoLink);
    translationUrl = videoTranslateData.url;
  } catch (error: unknown) {
    await context.reply(`Error while translating: ${error?.toString()}`);
    return;
  }
  await context.reply(`Translated video: ${translationUrl}`);
});

bot.command("debug_ytdl_info", async (context) => {
  // const videoInfo = await ytdl.getBasicInfo(mockVideoLink, {
  //   agent: ytdlAgent,
  // });
  // await context.reply(`Got basic ytdl info: ${Object.keys(videoInfo)}`);
});

bot.command("debug_ytdl_download", async (context) => {
  const commandArgs = context.message.text.split(" ").slice(1);
  const quality = parseInt(commandArgs[0] || "18");
  // const videoBuffer = await downloadYoutubeVideo(mockVideoLink, {
  //   quality,
  // });

  // await context.reply(`Downloaded video buffer: ${videoBuffer.byteLength}`);
});

bot.command("debug_timeout", async (context) => {
  // pending promise
  await new Promise((resolve, reject) => {
    setInterval(() => {
      logger.info(`Debug timeout ${new Date().toLocaleString()}`);
    }, 5000);
  });
});

const mapLanguageCodeToFlag = {
  en: "🇬🇧",
  ru: "🇷🇺",
  kk: "🇰🇿",
};

const renderScreen = async (
  context: BotContext,
  ...args: Parameters<BotContext["reply"]>
) => {
  const isEdit = context.callbackQuery ?? context.inlineMessageId;
  args[1] = { parse_mode: "Markdown", ...args[1] };
  return await context[(isEdit ? "editMessageText" : "reply") as "reply"](
    ...args
  );
};

const renderTranslateScreen = async (context: BotContext, router: Router) => {
  let link = router.session.link as string;
  const videoPlatform = getVideoPlatform(link);
  logger.log("Video platform:", videoPlatform);

  const translateVideoMessage = t("translate_video"); //.replace("link", link);
  const voiceTranslateActionButton = createActionButton(t("voice_faster"), {
    context,
    routerId: router.id,
    data: {
      type: ActionType.TranslateVoice,
    },
  });
  const onlineVideoTranslateActionButton = createActionButton(
    t("video_mp4_online"),
    {
      context,
      routerId: router.id,
      data: {
        type: ActionType.TranslateVideo,
      },
    }
  );
  const translateLanguage = getTranslateLanguage(context);
  const translationLanguageActionButton = createActionButton(
    t("translation_language", {
      language_flag: languageToFlag[translateLanguage],
    }),
    {
      context,
      routerId: router.id,
      data: {
        type: ActionType.Navigate,
        screen: Screen.LanguageSettings,
      },
    }
  );
  // specify a reply_to_message_id on first message sent
  const renderScreenReplyParams = context.message?.message_id && {
    reply_parameters: {
      message_id: context.message.message_id,
    },
  };

  if (videoPlatform === VideoPlatform.Telegram) {
    // const url = new URL(link);
    // const telegramFileId = url.pathname.slice(1);

    return await renderScreen(context, t("translate_video"), {
      disable_notification: true,
      // reply_to_message_id: context.message.message_id,
      reply_markup: Markup.inlineKeyboard([
        // [voiceTranslateActionButton],
        [onlineVideoTranslateActionButton],
        [translationLanguageActionButton],
      ]).reply_markup,

      ...renderScreenReplyParams,
    });
  }

  if (videoPlatform === VideoPlatform.YouTube) {
    const videoId = getYoutubeVideoId(link);
    link = shortenYoutubeLink(videoId);
    const videoTranslateApp = new URL(VIDEO_TRANSLATE_APP_URL);
    videoTranslateApp.searchParams.set("url", link);
    videoTranslateApp.searchParams.set("lang", translateLanguage);

    return await renderScreen(context, translateVideoMessage, {
      parse_mode: "Markdown",
      disable_notification: true,
      // reply_to_message_id: context.message.message_id,
      reply_markup: Markup.inlineKeyboard([
        [voiceTranslateActionButton],
        [
          createActionButton(t("audio_mp3"), {
            context,
            routerId: router.id,
            data: {
              type: ActionType.TranslateAudio,
            },
          }),
          // Markup.button.callback(
          //   "🎧 Аудио (mp3)",
          //   encodeTranslateAction(
          //     TranslateType.Audio,
          //     shortLink,
          //     TranslateQuality.Mp4_360p
          //   )
          // ),
        ],
        [onlineVideoTranslateActionButton],
        // [Markup.button.webApp(t("video_mp4"), videoTranslateApp.href)],
        [translationLanguageActionButton],
        // [
        //   Markup.button.callback(
        //     "📺 Видео (mp4) (дольше ⏳)",
        //     encodeChooseVideoQualityAction(shortLink)
        //   ),
        // ],
      ]).reply_markup,
      ...renderScreenReplyParams,
    });
  }

  await renderScreen(context, translateVideoMessage, {
    disable_notification: true,
    reply_markup: Markup.inlineKeyboard([
      [voiceTranslateActionButton],
      [translationLanguageActionButton],
    ]).reply_markup,
    ...renderScreenReplyParams,
  });
};

const renderChooseTranslateLanguage = async (
  context: BotContext,
  router: Router
) => {
  const routerId = router.id;

  const languageButtonRows: Hideable<InlineKeyboardButton.CallbackButton>[][] =
    [];
  const languages = Object.entries(languageToFlag);
  const LANGUAGES_PER_ROW = 5;
  for (let index = 0; index < languages.length; index += LANGUAGES_PER_ROW) {
    const row = languages
      .slice(index, index + LANGUAGES_PER_ROW)
      .map(([langCode, flag]) =>
        createActionButton(flag, {
          context,
          routerId,
          data: {
            type: ActionType.ChooseLanguage,
            language: langCode,
          },
        })
      );
    languageButtonRows.push(row);
  }

  await renderScreen(context, t("choose_language"), {
    reply_markup: Markup.inlineKeyboard([
      ...languageButtonRows,
      [
        createActionButton(t("back"), {
          context,
          routerId,
          data: {
            type: ActionType.Navigate,
            screen: Screen.Translate,
          },
        }),
      ],
    ]).reply_markup,
  });
};

const route = async (context: BotContext, routerId: string) => {
  const router = getRouter(context, routerId);
  switch (router.screen) {
    case Screen.Translate:
      await renderTranslateScreen(context, router);
      break;
    case Screen.LanguageSettings:
      await renderChooseTranslateLanguage(context, router);
      break;
  }
};

bot.on(messageTextNotCommand, async (context, next) => {
  // return await replyError(context, t("link_not_working"));

  const text = context.message.text;

  const linkMatch = getLinkMatch(text);
  const textContainsLink = !!linkMatch;
  if (!textContainsLink) {
    return await next();
  }

  // logger.info(
  //   `Incoming translate request: ${inspect(context.update, { depth: null })}`
  // );

  const router = createRouter(context, Screen.Translate, { link: text });
  await route(context, router.id);
});

bot.on(message("video"), async (context) => {
  // context.message.video

  const video = context.message.video;
  const videoFileUrl = new URL(`tg://video/${context.message.message_id}`);
  videoFileUrl.searchParams.set("duration", `${video.duration}`);
  if (video.thumbnail) {
    videoFileUrl.searchParams.set("thumbnail", `${video.thumbnail.file_id}`);
  }

  const router = createRouter(context, Screen.Translate, {
    link: videoFileUrl.href,
  });
  await route(context, router.id);
});

const preCheckoutQueryUpdate = (
  update: Update
): update is Update.PreCheckoutQueryUpdate => {
  if (!("pre_checkout_query" in update)) return false;
  return true;
};

bot.on(preCheckoutQueryUpdate, async (context) => {
  console.log("pre checkout query update", context.update);
  await context.answerPreCheckoutQuery(true);
});

bot.on(message("successful_payment"), async (context, next) => {
  console.log("succesful payment update", context.update);

  const starsAmountPaid = context.message.successful_payment
    .total_amount as keyof typeof starsAmountToOptionMap;
  const creditsOptionPurchased = starsAmountToOptionMap[starsAmountPaid];

  context.session.balance =
    (context.session.balance ?? 0) + creditsOptionPurchased.credits;

  // the successful payment update should be stored in the updates table

  const balance = getCurrentBalance(context);
  await context.reply(
    t("success_payment")
      .replace("{credits}", `${creditsOptionPurchased.credits}`)
      .replace("{balance}", `${balance}`)
  );
});

let videoTranslateProgressCount = 0;
bot.action(/.+/, async (context) => {
  const isFromOwner = context.from?.username === OWNER_USERNAME;
  const payload = context.match[0];
  const actionPayload = decodeActionPayload(payload);
  const routerId = actionPayload.routerId;
  const actionId = actionPayload.actionId;

  if (routerId === "TOPUP") {
    const startsTopupAmount = parseInt(
      actionId
    ) as keyof typeof starsAmountToOptionMap;

    const option = starsAmountToOptionMap[startsTopupAmount];

    return await context.replyWithInvoice({
      title: `${option.credits} video translation credits`,
      description: `Purchase ${option.credits} credits used for video translation (1 credit = 1 minute of video)`,
      payload: payload,
      prices: [
        {
          label: `${option.credits} Credits`,
          // price of the X number of credits in Stars
          amount: startsTopupAmount,
        },
      ],
      currency: "XTR", // Telegram Stars
      provider_token: "",
    });
  }

  const router = getRouter(context, routerId);
  console.log(
    `Getting action data for router: ${routerId} and action: ${actionId}`
  );
  const actionData = getActionData(context, routerId, actionId);
  if (!actionData) {
    // Old action messages was cleared than just delete message
    try {
      console.log("Deleting current message on NO action data found...");
      await context.deleteMessage();
    } catch (_) {}
    // throw new Error("Action data is undefined");
    return;
  }
  const actionType = actionData.type;

  if (actionType === ActionType.Navigate) {
    context.session.routers![routerId].screen = actionData.screen;
    return await route(context, routerId);
  }

  if (actionType === ActionType.ChooseLanguage) {
    context.session.translateLanguage = actionData.language;
    context.session.routers![routerId].screen = Screen.Translate;

    return await route(context, routerId);
  }

  // const actionType = actionData[0] as TranslateType;
  // @ts-ignore
  if (actionType === TranslateType.ChooseVideoQuality) {
    // @ts-ignore
    const link = actionData.slice(1);
    await context.editMessageText(
      t("choose_quality"),
      Markup.inlineKeyboard([
        Markup.button.callback(
          "Низкое",
          encodeTranslateAction(
            TranslateType.Video,
            link,
            TranslateQuality.Mp4_360p
          )
        ),
        ...(isFromOwner
          ? [
              Markup.button.callback(
                "Среднее (дольше ⏳)",
                encodeTranslateAction(
                  TranslateType.Video,
                  link,
                  TranslateQuality.Mp4_720p
                )
              ),
            ]
          : []),
      ])
    );
    return;
  }

  // Video translation actions start from here
  //

  // const translateAction = decodeTranslateAction(actionData);
  // const videoLink = translateAction.url;
  let videoLink = router.session.link as string;
  const videoPlatform = getVideoPlatform(videoLink);
  if (videoPlatform === VideoPlatform.YouTube) {
    const videoId = getYoutubeVideoId(videoLink);
    videoLink = shortenYoutubeLink(videoId);
  }
  const targetTranslateLanguage = getTranslateLanguage(context);
  const translateAction = {
    translateType: null,
    quality: TranslateQuality.Mp4_360p,
  };

  const videoInfo = await getVideoInfo(videoLink);
  // const originalVideoDuration = videoInfo.duration;

  const currentCreditsBalance = getCurrentBalance(context);
  const videoDuration =
    videoInfo.duration ?? moment.duration({ minutes: 30 }).asSeconds();

  let isValidationError = true;
  if (
    videoDuration >
    moment.duration({ minutes: currentCreditsBalance }).asSeconds()
  ) {
    await replyError(
      context,
      "You dont have enough video translation credits to perform this translate, please topup your credits balance first /balance",
      {
        disable_notification: true,
      }
    );
  } else if (
    videoInfo.duration &&
    videoInfo.duration > moment.duration({ hours: 1 }).asSeconds()
  ) {
    await replyError(context, t("video_too_long"), {
      disable_notification: true,
    });
    // } else if (
    // translateAction.translateType === TranslateType.Video &&
    // originalVideoDuration &&
    // originalVideoDuration > moment.duration({ hours: 1.5 }).asSeconds()
    // ) {
    //   await replyError(context, t("video_processing_slow"), {
    //     disable_notification: true,
    //   });
    // } else if (
    //   translateAction.quality === TranslateQuality.Mp4_720p &&
    //   originalVideoDuration &&
    //   originalVideoDuration > moment.duration({ minutes: 30 }).asSeconds()
    // ) {
    //   await replyError(context, t("video_quality_too_slow"), {
    //     disable_notification: true,
    //   });
    // } else if (videoTranslateProgressCount >= 1) {
    //   await replyError(context, t("max_videos_processing"));
  } else {
    isValidationError = false;
  }
  if (isValidationError) {
    try {
      console.log("Deleting current message on validation error...");
      await context.deleteMessage();
    } catch (_) {}
    return;
  }

  // const CONCURRENT_VIDEO_TRANSLATE_LIMIT = 1;

  if (context.session.translationStartedAt) {
    if (
      moment().diff(context.session.translationStartedAt, "seconds") <
      EXECUTION_TIMEOUT
    ) {
      return await replyError(context, t("concurrent_translations_limit"));
    }
  }

  context.session.translationStartedAt = new Date().toISOString();
  const translateTransaction = Sentry.startTransaction({
    op: "translate",
    name: "Translate Transaction",
  });
  let progressInterval: NodeJS.Timer | undefined;
  let ffmpegProgress = 0;
  videoTranslateProgressCount += 1;
  try {
    await handleTranslateInProgress(context, ffmpegProgress);
    // progressInterval = setInterval(async () => {
    //   try {
    //     await handleTranslateInProgress(context, ffmpegProgress);
    //   } catch (error) {
    //     clearInterval(progressInterval);
    //     await handleError(error, context);
    //   }
    // }, moment.duration({ minutes: 5 }).asMilliseconds());

    logger.info("Requesting translation...");
    let translationUrl: string = getRouterSessionData(
      context,
      routerId,
      "translationUrl"
    ); //| undefined;
    let translationAudio: Buffer | undefined = undefined;
    console.log("Translation url:", translationUrl);
    if (!translationUrl) {
      try {
        // translaform serialized telegram video link to mp4 link
        if (videoPlatform === VideoPlatform.Telegram) {
          const videoUrl = new URL(videoLink);
          const videoMessageId = +videoUrl.pathname.slice(1);

          // console.log("Downloading large video file...");
          // const videoBuffer = await downloadLargeFile(
          //   context.chat!.id,
          //   videoMessageId
          // );
          // console.log("Uploading large video file...");
          // const videoFileUrl = await uploadVideo(videoBuffer);
          const videoFileUrl = await delegateDownloadLargeFile(
            context.chat!.id,
            videoMessageId
          );

          if (actionType === ActionType.TranslateVideo) {
            console.log(
              `Setting action data for router: ${routerId}, action: ${actionId}`
            );
            setActionData(context, routerId, actionId, actionData);
            setRouterSessionData(context, routerId, "videoLink", videoFileUrl);
          }

          // set mp4 file url
          videoLink = videoFileUrl;
        }

        if (
          YANDEX_VIDEO_TRANSLATE_LANGUAGES.includes(targetTranslateLanguage)
        ) {
          const videoTranslateData = await translateVideoFinal(
            videoLink,
            targetTranslateLanguage
          );
          translationUrl = videoTranslateData.url;
        } else {
          console.log(
            "requesting video translate... !LAMBDA_TASK_ROOT",
            !LAMBDA_TASK_ROOT
          );
          if (!LAMBDA_TASK_ROOT) {
            translationAudio = await translateAnyVideo(
              videoLink,
              targetTranslateLanguage
            );
          }
        }
      } catch (error) {
        // if (error instanceof Error) {
        if (error instanceof TranslateException) {
          if (error.message) {
            const YANDEX_TRANSLATE_ERROR_MESSAGE =
              "Возникла ошибка, попробуйте позже";
            if (error.message === YANDEX_TRANSLATE_ERROR_MESSAGE) {
              await replyError(context, t("cannot_translate_video"));
              return;
            }

            await replyError(
              context,
              t("translator_error", {
                error_message: t("generic_error"),
              })
            );
            return;
          }

          await replyError(context, t("translation_error"));
          return;
        }
        throw error;
      }
      logger.info(`Translated: ${translationUrl}`);
    }

    if (actionType === ActionType.TranslateVideo && LAMBDA_TASK_ROOT) {
      // if running inside cloud function delegate translating process to the more performant machine (container)
      // preserve action data back for container
      // setActionData(context, routerId, actionId, actionData);
      if (translationUrl) {
        setRouterSessionData(
          context,
          routerId,
          "translationUrl",
          translationUrl
        );
      }

      // proxy update to worker bot server
      await axios.post(WORKER_BOT_SERVER_WEBHOOK_URL, context.update);
      return;
    }

    let translateAudioBuffer: Buffer;
    if (!translationAudio) {
      logger.info("Downloading translation...");
      const translateAudioResponse = await axiosInstance.get<ArrayBuffer>(
        translationUrl,
        {
          responseType: "arraybuffer",
          // responseType: "stream",
        }
      );
      translateAudioBuffer = Buffer.from(translateAudioResponse.data);
      logger.info(`Downloaded translation: ${translateAudioBuffer.length}`);
    } else {
      translateAudioBuffer = translationAudio;
    }

    let videoTitle = videoInfo.title;
    if (videoTitle) {
      try {
        logger.info("Translating video title to russian...");
        videoTitle = await translateText(videoTitle, targetTranslateLanguage);
        logger.info(`Translated video title to russian: ${videoTitle}`);
      } catch (error) {
        handleWarnError("Unable to translate video title:", error);
      }
    }

    const videoThumbnailUrl = videoInfo.thumbnail;
    console.log("video thumbnail url: " + videoThumbnailUrl);
    let thumbnailBuffer: Buffer | undefined;
    if (videoThumbnailUrl) {
      thumbnailBuffer =
        (await getVideoThumbnail(videoThumbnailUrl)) ?? undefined;
    }
    console.log("thumbnail buffer", thumbnailBuffer?.byteLength);

    // await context.replyWithPhoto({ source: thumbnailBuffer! });
    const originalArtist = videoInfo.artist;
    let artist = originalArtist;
    if (artist) {
      try {
        // const translateResponse = await translate(artist, {
        //   to: "ru",
        // });
        // artist = translateResponse.text;
        artist = await translateText(artist, targetTranslateLanguage);
        artist = artist.split(" ").map(capitalize).join(" ");
      } catch (error) {
        logger.warn(
          "Unable to translate video artist:",
          error?.message || error
        );
      }
    }

    logger.info(`Author name: ${artist}`);

    let videoDuration: number | undefined = undefined;
    // polyfill if duration is not known initially
    if (!videoDuration) {
      const temporaryAudioFilePath = path.join(TEMP_DIR_PATH, "temp.mp3");
      await fs.writeFile(temporaryAudioFilePath, translateAudioBuffer);

      const ffprobeData = await new Promise<FfprobeData>((resolve, reject) =>
        // Only works with file path (no steams)
        ffmpeg.ffprobe(temporaryAudioFilePath, (error, data) => {
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        })
      );
      // const audioDuration = await getAudioDurationInSeconds(
      //   temporaryAudioFilePath
      // ); // ffprobe-based
      const audioDuration = ffprobeData.format.duration;

      if (
        videoInfo.duration &&
        audioDuration
        // syntesized speech can be either faster or slower than original speech
        // audioDuration > videoInfo.duration
      ) {
        // const speedFactor = videoInfo.duration / audioDuration;
        const speedFactor = audioDuration / videoInfo.duration;

        console.log(
          `Speeding up audio duration: original: ${videoInfo.duration}, current: ${audioDuration}, factor: ${speedFactor}`
        );
        const resultStream = new PassThrough();
        const streamChunks: Uint8Array[] = [];
        resultStream.on("data", (chunk) => streamChunks.push(chunk));

        await new Promise((resolve, reject) =>
          ffmpeg(temporaryAudioFilePath)
            .audioFilters(`atempo=${Math.min(speedFactor, 2)}`)
            .format("mp3")
            .on("progress", (progress) => {
              console.log(`Processing: ${progress.percent}% done`);
            })
            .on("error", (error) => {
              console.error("Failed to process", error);
              reject(error);
            })
            .on("end", (data) => {
              console.log("Finished processing");
              resolve(data);
            })
            .pipe(resultStream, { end: true })
        );

        console.log("streamChunks length", streamChunks.length);
        const resultBuffer = Buffer.concat(streamChunks);
        console.log("speedup result buffer bytes", resultBuffer.byteLength);

        translateAudioBuffer = resultBuffer;
      }

      await fs.rm(temporaryAudioFilePath);
      logger.info(`Audio duration: ${audioDuration}`);
      videoDuration = audioDuration as number;
    }

    // if (translateAction.translateType === TranslateType.Voice) {
    if (actionType === ActionType.TranslateVoice) {
      const outputBuffer = translateAudioBuffer;
      outputBuffer.name = `${videoTitle || "unknown"}.mp3`;

      const finalArtist = artist
        ? artist === originalArtist
          ? artist
          : `${artist} (${originalArtist})`
        : "Unknown artist";

      let fileMessage: Api.Message;
      await useTelegramClient(async (telegramClient) => {
        fileMessage = await telegramClient.sendFile(LOGGING_CHANNEL_CHAT_ID, {
          file: outputBuffer,
          // caption: `${videoLink}`,
          caption: `🎧 <b>${videoTitle || "Unknown"}</b>\n— ${finalArtist}\n${
            videoPlatform === VideoPlatform.Telegram ? "" : videoLink
          }`,
          parseMode: "html",
          thumb: thumbnailBuffer,

          attributes: [
            new Api.DocumentAttributeAudio({
              duration: Math.floor(videoDuration),
              title: videoTitle,
              performer: finalArtist,
            }),
            // new Api.DocumentAttributeFilename({
            //   fileName: "mqdefault.jpg",
            // }),
          ],
        });
      });
      await bot.telegram.copyMessage(
        context.chat?.id ?? 0,
        LOGGING_CHANNEL_CHAT_ID,
        fileMessage!.id
      );
      await telegramLoggerContext.reply("<translated audio>");
      try {
        console.log(
          "Deleting current message on finish after sending translated audio..."
        );
        await context.deleteMessage();
      } catch (_) {}

      await useTelegramClient(async (telegramClient) => {
        // reupdate translated file message with new client
        [fileMessage] = await telegramClient.getMessages(
          LOGGING_CHANNEL_CHAT_ID,
          {
            ids: [fileMessage!.id],
          }
        );
        // Delete translated message from the channel (copyrights/privacy)
        await fileMessage.delete({ revoke: true });
      });
      return;
    }

    // const youtubeVideoFormatItag =
    //   translateQualityToYoutubeVideoFormatItag[translateAction.quality];

    // if (
    //   videoInfo.formats?.findIndex(
    //     (videoFormat) => videoFormat.itag === youtubeVideoFormatItag.video
    //   ) === -1
    // ) {
    //   await replyError(context, t("video_format_not_found"));
    //   return;
    // }
    // if (
    //   videoInfo.formats?.findIndex(
    //     (videoFormat) => videoFormat.itag === youtubeVideoFormatItag.audio
    //   ) === -1
    // ) {
    //   await replyError(context, t("audio_format_not_found"));
    //   return;
    // }

    // logger.log(
    //   `Requesting download stream for quality ${youtubeVideoFormatItag.video} ...`
    // );
    // logger.log(
    //   `Requesting download stream for quality ${youtubeVideoFormatItag.audio} ...`
    // );
    // const audioStream = ytdl(videoLink, {
    //   quality: youtubeVideoFormatItag.audio,
    //   agent: ytdlAgent,
    // });
    logger.info("Downloading video stream...");
    let videoBuffer: Buffer;
    if (videoPlatform === VideoPlatform.Telegram) {
      const videoDownloadLink = getRouterSessionData(
        context,
        routerId,
        "videoLink"
      );
      const videoResponse = await axios.get<Buffer>(videoDownloadLink, {
        responseType: "arraybuffer",
      });
      videoBuffer = videoResponse.data;
    } else {
      // videoBuffer = await downloadYoutubeVideo(videoLink, {
      //   quality: 18,
      // });
      const videoUrl = await downloadVideo(videoLink, 18);
      const videoResponse = await axios.get<ArrayBuffer>(videoUrl, {
        responseType: "arraybuffer",
      });
      videoBuffer = Buffer.from(videoResponse.data);
    }
    // const audioBuffer = await streamToBuffer(audioStream);
    logger.info(`Video downloaded: ${videoBuffer.length}`);

    // if (!ffmpeg.isLoaded()) {
    //   logger.info("Loading ffmpeg...");
    //   await ffmpeg.load();
    //   logger.info("FFmpeg loaded");
    // }
    // ffmpeg.setLogger(({ message }) => logger.info(message));
    // ffmpeg.setProgress(({ ratio }) => {
    //   ffmpegProgress = ratio;
    // });

    // const videoFilePath = "source.mp4";
    // const audioFilePath = "source2.mp3";
    // const translateAudioFilePath = "source3.mp3";
    const videoFilePath = path.join(TEMP_DIR_PATH, "source.mp4");
    const translateAudioFilePath = path.join(TEMP_DIR_PATH, "source3.mp3");

    // ffmpeg.FS("writeFile", videoFilePath, videoBuffer);
    // // ffmpeg.FS("writeFile", audioFilePath, audioBuffer);
    // ffmpeg.FS("writeFile", translateAudioFilePath, translateAudioBuffer);
    await fs.writeFile(videoFilePath, videoBuffer);
    await fs.writeFile(translateAudioFilePath, translateAudioBuffer);

    if (videoPlatform === VideoPlatform.Telegram) {
      videoLink = "";
    }

    let translatedFileMessage: Api.Message;
    await {
      [ActionType.TranslateVoice]: async () => {},
      [ActionType.TranslateAudio]: async () => {
        const resultFilePath = "audio.mp3";

        // prettier-ignore
        // await ffmpeg.run(
        //   "-i", videoFilePath,
        //   "-i", translateAudioFilePath,

        //   "-filter_complex",
        //     `[0:a]volume=${percent(10)}[a];` + // 10% original playback
        //     `[1:a]volume=${percent(100)}[b];` + // voice over
        //     '[a][b]amix=inputs=2:dropout_transition=0', // :duration=longest',

        //   // "-qscale:a", "9", // "4",
        //   // "-codec:a", "libmp3lame", // "aac",
        //   "-b:a", "64k", // decrease output size (MB) - default 128kb
        //   "-ac", "1", // decrease audio channel stereo to mono
        //   // " -pre", "ultrafast",

        //   resultFilePath,
        // );
        // ffmpeg -i input.mp4 -f null /dev/null
        logger.log("Starting ffmpeg process...");
        await new Promise((resolve, reject) =>
          ffmpeg()
            // add first input (video with its original audio)
            .input(videoFilePath)
            // add second input (voice-over audio)
            .input(translateAudioFilePath)
            // Create a complex filter chain:
            //   - Reduce the volume of the first audio stream to 10%
            //   - Use the full volume for the second audio stream
            //   - Mix them using amix without dropping any inputs
            .complexFilter(
              [
                {
                  filter: "volume",
                  options: percent(10), // 10% volume
                  inputs: "0:a",
                  outputs: "a",
                },
                {
                  filter: "volume",
                  options: percent(100), // 100% volume
                  inputs: "1:a",
                  outputs: "b",
                },
                {
                  filter: "amix",
                  options: { inputs: 2, dropout_transition: 0 },
                  inputs: ["a", "b"],
                  outputs: "mixed",
                },
              ]
              // "mixed"
            )
            // Set audio output options: bitrate and channels
            .outputOptions([
              "-b:a 64k", // set audio bitrate to 64kbps
              "-ac 1", // force mono audio output
            ])
            // Copy video stream without re-encoding (if desired, you can add "-c:v copy")
            .save(resultFilePath)
            .on("progress", (progress) => {
              console.log(`Processing: ${progress.percent}% done`);
            })
            .on("end", () => {
              console.log("Processing finished successfully.");
              resolve(undefined);
            })
            .on("error", (err) => {
              console.error("An error occurred:", err.message);
              reject(err);
            })
        );

        logger.info("Getting ffmpeg output in node environment");
        // const outputFile = ffmpeg.FS("readFile", resultFilePath);
        const outputBuffer = await fs.readFile(resultFilePath);
        // const outputBuffer = Buffer.from(outputFile);
        outputBuffer.name = `${videoTitle}.mp3`;

        // await context.sendAudio(
        //   {
        //     source: translationBuffer,
        //     ...(resourceTitle ? { filename: resourceTitle } : {}),
        //   },
        //   {
        //     ...(resourceTitle ? { title: resourceTitle } : {}),
        //   }
        // );
        // const form = new FormData({ maxDataSize: 20971520 });
        // form.append("file", outputBuffer, "audio.mp3");
        // form.append("duration", Math.floor(audioDuration));
        // form.append("title", resourceTitle ?? "");
        // form.append("artist", artist ?? "");
        // form.append("caption", link);
        // form.append("thumbnail", resourceThumbnailUrl ?? "");
        // await fs.writeFile("./thumb.jpg", thumbnailBuffer);

        logger.info("Uploading to telegram channel...");
        await useTelegramClient(async (telegramClient) => {
          const fileMessage = await telegramClient.sendFile(
            LOGGING_CHANNEL_CHAT_ID,
            {
              file: outputBuffer,
              // caption: `${videoLink}`,
              caption: `🎧 <b>${videoTitle}</b>\n— ${artist} (${originalArtist})\n${videoLink}`,
              parseMode: "html",
              thumb: thumbnailBuffer,

              attributes: [
                new Api.DocumentAttributeAudio({
                  duration: Math.floor(videoDuration),
                  title: videoTitle,
                  performer: `${artist} (${originalArtist})`,
                }),
                // new Api.DocumentAttributeFilename({
                //   fileName: "mqdefault.jpg",
                // }),
              ],
            }
          );
          translatedFileMessage = fileMessage;
        });

        // const uploadResponse = await axiosInstance.post<UploadResponse>(
        //   UPLOADER_URL,
        //   // {
        //   //   file: audioBuffer.toString("base64"),
        //   //   // file: translationUrl,
        //   //   duration: Math.floor(audioDuration),
        //   //   title: resourceTitle ?? "",
        //   //   artist: artist ?? "",
        //   //   caption: link,
        //   //   thumbnail: resourceThumbnailUrl ?? "",
        //   // }
        //   form,
        //   {
        //     headers: { ...form.getHeaders() },
        //   }
        // );
      },
      [ActionType.TranslateVideo]: async () => {
        // const resultFilePath = "video.mp4";
        const resultFilePath = path.join(TEMP_DIR_PATH, "video.mp4");

        // // prettier-ignore
        // await ffmpeg.run(
        //   "-i", videoFilePath,
        //   // "-i", audioFilePath,
        //   "-i", translateAudioFilePath,

        //   "-filter_complex",
        //     `[0:a]volume=${percent(10)}[a];` + // 10% original playback
        //     `[1:a]volume=${percent(100)}[b];` + // voice over
        //     '[a][b]amix=inputs=2:dropout_transition=0', // :duration=longest',

        //   // "-qscale:a", "9", // "4",
        //   // "-codec:a", "libmp3lame", // "aac",
        //   // "-b:a", "64k", // decrease output size (MB) - default 128kb
        //   // " -pre", "ultrafast",

        //   resultFilePath,
        // );
        logger.log("Starting ffmpeg process...");
        await new Promise((resolve, reject) => {
          ffmpeg()
            .input(videoFilePath)
            .input(translateAudioFilePath)
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
            ])
            // .outputOptions(["-map 0:v", "-map [out]"])
            .outputOptions([
              "-map 0:v", // video from first input
              "-map [mixed]", // our processed audio
              "-c:v copy", // copy video without re-encoding
              "-c:a aac", // encode audio using AAC
            ])
            .save(resultFilePath)
            .on("progress", (progress) => {
              console.log(`Processing: ${progress.percent}% done`);
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
        const outputBuffer = await fs.readFile(resultFilePath);

        // const outputFile = ffmpeg.FS("readFile", resultFilePath);
        // const outputBuffer: Buffer | null = Buffer.from(outputFile);
        outputBuffer.name = `${videoTitle}.mp4`;

        let videoCaption:
          | string
          | undefined = `📺 <b>${videoTitle}</b>\n— ${artist} (${originalArtist})\n${videoLink}`;
        if (videoPlatform === VideoPlatform.Telegram) {
          videoCaption = undefined;
        }

        logger.info("Uploading to telegram channel...");
        await useTelegramClient(async (telegramClient) => {
          const fileMessage = await telegramClient.sendFile(
            LOGGING_CHANNEL_CHAT_ID,
            {
              file: outputBuffer,
              caption: videoCaption,
              parseMode: "html",
              thumb: thumbnailBuffer,
              attributes: [
                new Api.DocumentAttributeVideo({
                  // w: 320,
                  // h: 180,
                  // w: 16,
                  // h: 9,
                  w: 640,
                  h: 360,
                  duration: Math.floor(videoDuration),
                  supportsStreaming: true,
                }),
              ],
            }
          );
          translatedFileMessage = fileMessage;
        });
      },
      [TranslateType.ChooseVideoQuality]: async () => {},
    }[actionType]();
    logger.info("Uploaded to telegram message id:", translatedFileMessage!?.id);

    await bot.telegram.copyMessage(
      context.chat?.id ?? 0,
      LOGGING_CHANNEL_CHAT_ID,
      translatedFileMessage!.id
    );
    const videoDurationFormatted = formatDuration(videoDuration);
    await telegramLoggerContext.reply(
      `<translated video, ${videoDurationFormatted}>!`
    );

    console.log("Deleting original video after sent translated video...");
    await useTelegramClient(async (telegramClient) => {
      // reupdate translated file message with new client
      [translatedFileMessage] = await telegramClient.getMessages(
        LOGGING_CHANNEL_CHAT_ID,
        {
          ids: [translatedFileMessage!.id],
        }
      );
      // Delete translated message from the channel (copyrights/privacy)
      await translatedFileMessage.delete({ revoke: true });
    });

    // Decrease amount of video translation credits based on video duration
    const videoDurationCredits = Math.ceil(
      moment.duration({ seconds: videoDuration }).asMinutes()
    );
    context.session.balance =
      (context.session.balance ?? 0) - videoDurationCredits;

    try {
      console.log("Deleting in-progress message on the end...");
      await context.deleteMessage();
    } catch (_) {}
  } catch (error) {
    console.log("Catched action error:", error);
    // delete in progress message in case of error
    try {
      console.log("Deleting in-progress message on error...");
      await context.deleteMessage();
    } catch (_) {}
    throw error;
  } finally {
    context.session.translationStartedAt = undefined;
    videoTranslateProgressCount -= 1;
    clearInterval(progressInterval);
    translateTransaction.finish();
  }
});

bot.use(async (context) => {
  await replyError(context, t("only_youtube_supported"), {
    disable_notification: true,
  });
});

export { bot } from "./botinstance";
