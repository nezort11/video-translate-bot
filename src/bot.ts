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
import { Driver, getCredentialsFromEnv, TypedValues } from "ydb-sdk";
import { Ydb } from "telegraf-session-store-ydb";
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
import ffmpeg from "fluent-ffmpeg";
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
import { VideoTranslateResponse } from "../packages/video-translate-server/src/services/vtrans";

// import {
//   TranslateException,
//   TranslateInProgressException,
//   // translateVideo,
// } from "./translate";
import { downloadLargeFile, getClient } from "./telegramclient";
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
} from "./env";
import {
  telegramLoggerContext,
  telegramLoggerIncomingMiddleware,
  telegramLoggerOutgoingMiddleware,
} from "./telegramlogger";
// import { botThrottler, translateThrottler } from "./throttler";
import { escapeHtml, importPTimeout } from "./utils";
import { Message, Update } from "telegraf/types";
import {
  TranslateException,
  TranslateInProgressException,
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
import { downloadVideo, ytdlAgent } from "./services/ytdl";
import { translate } from "./services/translate";
import { updatesTable } from "./schema";
import {
  ActionType,
  Router,
  Screen,
  createActionButton,
  createRouter,
  decodeActionPayload,
  getActionData,
  getRouter,
  getRouterSessionData,
  setActionData,
  setRouterSessionData,
} from "./actions";

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

const getTranslateLanguage = (context: BotContext) => {
  if (context.session.translateLanguage) {
    return context.session.translateLanguage;
  }

  const lang = context.from?.language_code;
  switch (lang) {
    case "en":
    case "ru":
    case "kk":
      return lang;
    default:
      return "en";
  }
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
bot.use(Composer.drop((context) => context.chat?.type !== "private"));

// const s3Session = new S3Session(STORAGE_BUCKET);

// bot.use(s3Session);
// bot.use(Telegraf.log());

const trackUpdate = async (update: Update) => {
  try {
    await driver.queryClient.do({
      fn: async (session) => {
        await session.execute({
          text: `
        CREATE TABLE IF NOT EXISTS updates (
          update_id Uint64,
          update_data Json,
          PRIMARY KEY (update_id)
        );
      `,
        });
        console.log("Table 'updates' created successfully");
      },
    });
    console.log("Table 'updates' is ready");

    await driver.tableClient.withSessionRetry(async (session) => {
      await session.executeQuery(
        `DECLARE $update_id AS Uint64;
       DECLARE $update_data AS Json;
       UPSERT INTO updates (update_id, update_data)
       VALUES ($update_id, $update_data);`,
        {
          $update_id: TypedValues.uint64(update.update_id),
          // Convert your update object to a JSON string
          $update_data: TypedValues.json(JSON.stringify(update)),
        }
      );
      console.log("Inserted update with ID:", update.update_id);
    });

    // await db.insert(updatesTable).values({
    //   updateId: update.update_id,
    //   updateData: update,
    // });
  } catch (error) {
    handleWarnError("save update error", error);
  }
};

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

process.env.YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS = path.resolve(
  MOUNT_ROOT_DIR_PATH,
  "./env/sakey.json"
);
const driver = new Driver({
  // connectionString does not work for some reason
  // connectionString: "",
  endpoint: YDB_ENDPOINT,
  database: YDB_DATABASE,
  authService: getCredentialsFromEnv(),
});
const sessionStore = Ydb<any>({
  driver,
  driverOptions: { enableReadyCheck: true },
  tableOptions: { shouldCreateTable: false },
});

bot.use(session({ store: sessionStore }));

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
  await context.persistentChatAction("typing", async () => {
    await next();
  });

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
  const videoInfo = await ytdl.getBasicInfo(mockVideoLink, {
    agent: ytdlAgent,
  });
  await context.reply(`Got basic ytdl info: ${Object.keys(videoInfo)}`);
});

bot.command("debug_ytdl_download", async (context) => {
  const commandArgs = context.message.text.split(" ").slice(1);
  const quality = parseInt(commandArgs[0] || "18");
  const videoBuffer = await downloadVideo(mockVideoLink, {
    quality,
  });

  await context.reply(`Downloaded video buffer: ${videoBuffer.byteLength}`);
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
      language_flag: mapLanguageCodeToFlag[translateLanguage],
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
        [voiceTranslateActionButton],
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
        [Markup.button.webApp(t("video_mp4"), videoTranslateApp.href)],
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
  await renderScreen(context, t("choose_language"), {
    reply_markup: Markup.inlineKeyboard([
      [
        createActionButton("🇬🇧", {
          context,
          routerId,
          data: {
            type: ActionType.ChooseLanguage,
            language: "en",
            // previousData,
          },
        }),
        createActionButton("🇷🇺", {
          context,
          routerId,
          data: {
            type: ActionType.ChooseLanguage,
            language: "ru",
          },
        }),
        createActionButton("🇰🇿", {
          context,
          routerId,
          data: {
            type: ActionType.ChooseLanguage,
            language: "kk",
          },
        }),
      ],
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

let videoTranslateProgressCount = 0;
bot.action(/.+/, async (context) => {
  const isFromOwner = context.from?.username === OWNER_USERNAME;
  const actionPayload = decodeActionPayload(context.match[0]);
  const routerId = actionPayload.routerId;
  const actionId = actionPayload.actionId;
  const router = getRouter(context, actionPayload.routerId);
  const actionData = getActionData(context, routerId, actionId);
  if (!actionData) {
    // Old action messages was cleared than just delete message
    try {
      await context.deleteMessage();
    } catch (error) {}
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

  // const translateAction = decodeTranslateAction(actionData);
  // const videoLink = translateAction.url;
  let videoLink = router.session.link as string;
  const videoPlatform = getVideoPlatform(videoLink);
  const targetTranslateLanguage = getTranslateLanguage(context);
  const translateAction = {
    translateType: null,
    quality: TranslateQuality.Mp4_360p,
  };

  const videoInfo = await getVideoInfo(videoLink);
  const originalVideoDuration = videoInfo.duration;

  let isValidationError = true;
  if (
    originalVideoDuration &&
    originalVideoDuration > moment.duration({ hours: 4 }).asSeconds()
  ) {
    await replyError(context, t("video_too_long"), {
      disable_notification: true,
    });
  } else if (
    translateAction.translateType === TranslateType.Video &&
    originalVideoDuration &&
    originalVideoDuration > moment.duration({ hours: 1.5 }).asSeconds()
  ) {
    await replyError(context, t("video_processing_slow"), {
      disable_notification: true,
    });
  } else if (
    translateAction.quality === TranslateQuality.Mp4_720p &&
    originalVideoDuration &&
    originalVideoDuration > moment.duration({ minutes: 30 }).asSeconds()
  ) {
    await replyError(context, t("video_quality_too_slow"), {
      disable_notification: true,
    });
  } else if (videoTranslateProgressCount >= 1) {
    await replyError(context, t("max_videos_processing"));
  } else {
    isValidationError = false;
  }
  if (isValidationError) {
    try {
      await context.deleteMessage();
    } catch (error) {}
    return;
  }

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

    logger.info("Request translation...");
    let translationUrl: string = getRouterSessionData(
      context,
      routerId,
      "translationUrl"
    ); //| undefined;
    console.log("translation url", translationUrl);
    if (!translationUrl) {
      try {
        // translaform serialized telegram video link to mp4 link
        if (videoPlatform === VideoPlatform.Telegram) {
          const videoUrl = new URL(videoLink);
          const videoMessageId = +videoUrl.pathname.slice(1);

          const videoBuffer = await downloadLargeFile(
            context.chat!.id,
            videoMessageId
          );
          const videoFileUrl = await uploadVideo(videoBuffer);

          if (actionType === ActionType.TranslateVideo && LAMBDA_TASK_ROOT) {
            setActionData(context, routerId, actionId, actionData);
            setRouterSessionData(context, routerId, "videoLink", videoFileUrl);
          }

          // set mp4 file url
          videoLink = videoFileUrl;
        }

        const videoTranslateData = await translateVideoFinal(
          videoLink,
          targetTranslateLanguage
        );
        translationUrl = videoTranslateData.url;
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
      // if running inside cloud function deletegate translating process to the more performant machine (container)
      // preserve action data back for container
      // setActionData(context, routerId, actionId, actionData);
      setRouterSessionData(context, routerId, "translationUrl", translationUrl);

      // proxy update to worker bot server
      await axios.post(WORKER_BOT_SERVER_WEBHOOK_URL, context.update);
      return;
    }

    logger.info("Downloading translation...");
    const translateAudioResponse = await axiosInstance.get<ArrayBuffer>(
      translationUrl,
      {
        responseType: "arraybuffer",
        // responseType: "stream",
      }
    );
    const translateAudioBuffer = Buffer.from(translateAudioResponse.data);
    logger.info(`Downloaded translation: ${translateAudioBuffer.length}`);

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
        logger.warn("Unable to translate video artist:", error);
      }
    }

    logger.info(`Author name: ${artist}`);

    let videoDuration = videoInfo.duration;
    // polyfill if duration is not known initially
    if (!videoDuration) {
      const temporaryAudioFilePath = "./temp.mp3";
      await fs.writeFile(temporaryAudioFilePath, translateAudioBuffer);
      const audioDuration = await getAudioDurationInSeconds(
        temporaryAudioFilePath
      ); // ffprobe-based
      await fs.rm(temporaryAudioFilePath);
      logger.info(`Duration: ${audioDuration}`);
      videoDuration = audioDuration as number;
    }

    // if (translateAction.translateType === TranslateType.Voice) {
    if (actionType === ActionType.TranslateVoice) {
      const outputBuffer = translateAudioBuffer;
      outputBuffer.name = `${videoTitle || "unknown"}.mp3`;

      const telegramClient = await getClient();
      const finalArtist = artist
        ? artist === originalArtist
          ? artist
          : `${artist} (${originalArtist})`
        : "Unknown artist";
      const fileMessage = await telegramClient.sendFile(
        LOGGING_CHANNEL_CHAT_ID,
        {
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
        }
      );
      await bot.telegram.copyMessage(
        context.chat?.id ?? 0,
        LOGGING_CHANNEL_CHAT_ID,
        fileMessage.id
      );
      await telegramLoggerContext.reply("<translated audio>");
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
      videoBuffer = await downloadVideo(videoLink, {
        quality: 18,
      });
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
    const tempDir = "/tmp";
    const videoFilePath = path.join(tempDir, "source.mp4");
    const translateAudioFilePath = path.join(tempDir, "source3.mp3");

    // ffmpeg.FS("writeFile", videoFilePath, videoBuffer);
    // // ffmpeg.FS("writeFile", audioFilePath, audioBuffer);
    // ffmpeg.FS("writeFile", translateAudioFilePath, translateAudioBuffer);
    await fs.writeFile(videoFilePath, videoBuffer);
    await fs.writeFile(translateAudioFilePath, translateAudioBuffer);

    if (videoPlatform === VideoPlatform.Telegram) {
      videoLink = "";
    }

    const telegramClient = await getClient();
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
              ],
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
        const resultFilePath = path.join(tempDir, "video.mp4");

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

        const fileMessage = await telegramClient.sendFile(
          LOGGING_CHANNEL_CHAT_ID,
          {
            file: outputBuffer,
            caption: `📺 <b>${videoTitle}</b>\n— ${artist} (${originalArtist})\n${videoLink}`,
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
      },
      [TranslateType.ChooseVideoQuality]: async () => {},
    }[actionType]();
    logger.info("Uploaded to telegram");

    await bot.telegram.copyMessage(
      context.chat?.id ?? 0,
      LOGGING_CHANNEL_CHAT_ID,
      translatedFileMessage!.id
    );
    await telegramLoggerContext.reply("<translated video>!");
    // Delete translated message from the channel (copyrights/privacy)
    await translatedFileMessage!.delete({ revoke: true });
  } catch (error) {
    throw error;
  } finally {
    videoTranslateProgressCount -= 1;
    clearInterval(progressInterval);
    try {
      await context.deleteMessage();
    } catch (error) {}
    translateTransaction.finish();
  }
});

bot.use(async (context) => {
  if (context.message && "video" in context.message) {
    await replyError(context, t("only_youtube_supported_upload"), {
      disable_notification: true,
    });
  } else {
    await replyError(context, t("only_youtube_supported"), {
      disable_notification: true,
    });
  }
});

export { bot } from "./botinstance";
