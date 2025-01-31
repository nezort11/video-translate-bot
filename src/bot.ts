import { bot } from "./botinstance";

// import { S3Session } from "telegraf-session-s33";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { Composer, Context, Markup, TelegramError, session } from "telegraf";
import { SQLite } from "@telegraf/session/sqlite";
import { message } from "telegraf/filters";
import axios, { AxiosError } from "axios";
import { load } from "cheerio";
// import { getAudioDurationInSeconds } from "get-audio-duration";
// import { getVideoDurationInSeconds } from "get-video-duration";
import path from "path";
import fs from "fs/promises";
import fss from "fs";
import ytdl from "@distube/ytdl-core";
import { createFFmpeg } from "@ffmpeg/ffmpeg";
import http from "http";
import https from "https";
import { Api } from "telegram";
// import translate from "@iamtraction/google-translate";
import * as Sentry from "@sentry/node";
import moment from "moment";
import { inspect } from "util";
import { Readable } from "stream";
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
import { sendAdminNotification } from "./notification";
import { getClient } from "./telegramclient";
import { logger } from "./logger";

import {
  OWNER_USERNAME,
  DEBUG_USER_CHAT_ID,
  IMAGE_TRANSLATE_URL,
  IS_PRODUCTION,
  SENTRY_DSN,
  STORAGE_CHANNEL_CHAT_ID,
  STORAGE_BUCKET,
  VIDEO_TRANSLATE_API_URL,
  YTDL_API_URL,
  VIDEO_TRANSLATE_APP_URL,
  APP_ENV,
} from "./env";
import {
  telegramLoggerContext,
  telegramLoggerIncomingMiddleware,
  telegramLoggerOutgoingMiddleware,
} from "./telegramlogger";
// import { botThrottler, translateThrottler } from "./throttler";
import { escapeHtml, importPTimeout } from "./utils";
import { Update } from "telegraf/types";
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
} from "./core";
import { ytdlAgent } from "./services/ytdl";
import { translate } from "./services/translate";

const getAudioDurationInSeconds: any = {};
const getVideoDurationInSeconds: any = {};
// const ytdl: any = {};

const AXIOS_REQUEST_TIMEOUT = moment.duration(45, "minutes").asMilliseconds();

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

const getShortYoutubeLink = (youtubeVideoId: string) =>
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

const translateVideoFinal = async (
  url: string
): Promise<VideoTranslateResponse> => {
  try {
    return await translateVideo(url);
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

const streamToBuffer = async (stream: Readable) => {
  const streamChunks: Uint8Array[] = [];
  for await (const streamChunk of stream) {
    streamChunks.push(streamChunk);
  }

  const streamBuffer = Buffer.concat(streamChunks);
  return streamBuffer;
};

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
const ffmpeg = createFFmpeg({
  log: true,
  logger: ({ message }) => logger.info(message),
  // corePath: path.resolve("../ffmpeg-dist/ffmpeg-core.js"),
  // workerPath: path.resolve("../ffmpeg-dist/ffmpeg-core.worker.js"),
  // wasmPath: path.resolve("../ffmpeg-dist/ffmpeg-core.wasm"),
});
// const ffmpeg: any = {};

// Disable bot in group chat
bot.use(Composer.drop((context) => context.chat?.type !== "private"));

// const s3Session = new S3Session(STORAGE_BUCKET);

// bot.use(s3Session);
// bot.use(Telegraf.log());

const sessionDb = new Database("./storage/session.sqlite");

const sessionStore = SQLite<{}>({ database: sessionDb });

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
      await context.reply(
        `⚠️ Не получилось перевести видео, так как это занимает слишком ⏳ много времени.`
      );
      return;
    }
  }

  logger.error(error);
  if (IS_PRODUCTION) {
    Sentry.captureException(error);
  }

  console.error(error);
  await Promise.allSettled([
    context.reply(
      `⚠️ Ошибка! Попробуй еще раз 🔁 или немного позже (✉️ информация об ошибке уже передана).`
    ),

    telegramLoggerContext.reply(`<code>${escapeHtml(inspect(error))}</code>`, {
      parse_mode: "HTML",
    }),
    // sendAdminNotification(
    //   `${(error as Error)?.stack || error}\nMessage: ${inspect(context, {
    //     depth: 10,
    //   })}`
    // ),
  ]);
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
    await context.editMessageText(
      `⏳ Видео в процессе перевода, обработка занимает до нескольких минут...`
    );
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

const START_MESSAGE = `
👋 Привет, пришли мне 🔗 ссылку на видео и я попробую 🚧 перевести его.

Поддерживаю полноценный перевод 📺 видео с видео-платформ 🌐 youtube.com

а также перевод 🎤 голоса для
🌐 instagram.com, tiktok.com, x.com
🇨🇳 bilibili.com, youku.com, v.qq.com, iqiyi.com
🇷🇺 vk.com, ok.ru
и других
`;

bot.start(async (context) => {
  await context.reply(
    START_MESSAGE,
    //  Я поддерживаю много различных платформ / соцсетей / сайтов, а также простые ссылки для видео / аудио.
    // Перевожу не только с английского, но и с многих других языков"
    { disable_notification: true }
  );
});

bot.command("search", async (context) => {
  // await context.reply
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
  const videoStream = ytdl(mockVideoLink, {
    agent: ytdlAgent,
    quality,
  });
  const videoBuffer = await streamToBuffer(videoStream);

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

bot.on(message("text"), async (context, next) => {
  const text = context.message.text;
  if (text.startsWith("/")) {
    return await next();
  }

  logger.info(
    `Incoming translate request: ${inspect(context.update, { depth: null })}`
  );

  const linkMatch = getLinkMatch(text);
  const textContainsLink = !!linkMatch;
  if (!textContainsLink) {
    if (text.length > 100) {
      return await replyError(
        context,
        "Запрос слишком длинный, пожалуйста сделайте короче"
      );
    }

    const translatedTextResult = await translate([text], "en");
    const translatedText = translatedTextResult.translations[0].text;

    const googleSearchYoutubeVideosUrl = buildGoogleSearchVideosUrl(
      `${translatedText} site:youtube.com`
    );
    const youtubeSearchUrl = buildYoutubeSearchUrl(translatedText);

    await context.reply(
      `🔍 Выполни поиск по запросу ${translatedText} (${text}).\n*Для перевода, пожалуйста, скопируйте и пришлите 🔗 ссылку на необходимое видео`,
      Markup.inlineKeyboard([
        Markup.button.url("🔍 Google", googleSearchYoutubeVideosUrl),
        Markup.button.url("📺 YouTube", youtubeSearchUrl),
      ])
    );

    return;
  }

  const link = text;
  const videoPlatform = getVideoPlatform(link);
  logger.log("Video platform:", videoPlatform);
  if (videoPlatform === VideoPlatform.YouTube) {
    const videoId = getYoutubeVideoId(link);
    const shortLink = getShortYoutubeLink(videoId);
    const videoTranslateApp = new URL(VIDEO_TRANSLATE_APP_URL);
    videoTranslateApp.searchParams.set("url", shortLink);

    await context.replyWithMarkdownV2(
      `⚙️ Каким образом перевести [это](${shortLink}) видео?`,
      {
        disable_notification: true,
        // reply_to_message_id: context.message.message_id,
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "🎙️ Голос (mp3) (быстрее ⚡️)",
              encodeTranslateAction(
                TranslateType.Voice,
                shortLink,
                TranslateQuality.Mp4_360p
              )
            ),
          ],
          [
            Markup.button.callback(
              "🎧 Аудио (mp3)",
              encodeTranslateAction(
                TranslateType.Audio,
                shortLink,
                TranslateQuality.Mp4_360p
              )
            ),
          ],
          [Markup.button.webApp("📺 Видео (mp4)", videoTranslateApp.href)],
          // [
          //   Markup.button.callback(
          //     "📺 Видео (mp4) (дольше ⏳)",
          //     encodeChooseVideoQualityAction(shortLink)
          //   ),
          // ],
        ]).reply_markup,
      }
    );
    return;
  }

  await context.replyWithMarkdownV2(
    `⚙️ Каким образом перевести [это](${link}) видео?`,
    {
      disable_notification: true,
      // reply_to_message_id: context.message.message_id,
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🎙️ Голос (mp3) (быстрее ⚡️)",
            encodeTranslateAction(
              TranslateType.Voice,
              link,
              TranslateQuality.Mp4_360p
            )
          ),
        ],
      ]).reply_markup,
    }
  );
});

let videoTranslateProgressCount = 0;
bot.action(/.+/, async (context) => {
  const isFromOwner = context.from?.username === OWNER_USERNAME;
  const actionData = context.match[0];
  const actionType = actionData[0] as TranslateType;
  if (actionType === TranslateType.ChooseVideoQuality) {
    const link = actionData.slice(1);
    await context.editMessageText(
      "Выбери качество видео:",
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

  const translateAction = decodeTranslateAction(actionData);
  const videoLink = translateAction.url;

  const videoInfo = await getVideoInfo(videoLink);
  const originalVideoDuration = videoInfo.duration;

  let isValidationError = true;
  if (
    originalVideoDuration &&
    originalVideoDuration > moment.duration({ hours: 4 }).asSeconds()
  ) {
    await context.reply(
      "⚠️ Видео для перевода слишком длинное, попробуйте перевести другое видео",
      { disable_notification: true }
    );
  } else if (
    translateAction.translateType === TranslateType.Video &&
    originalVideoDuration &&
    originalVideoDuration > moment.duration({ hours: 1.5 }).asSeconds()
  ) {
    await context.reply(
      "⚠️ Видео перевод слишком долго обрабатывать, попробуйте выбрать обычный аудио перевод",
      { disable_notification: true }
    );
  } else if (
    translateAction.quality === TranslateQuality.Mp4_720p &&
    originalVideoDuration &&
    originalVideoDuration > moment.duration({ minutes: 30 }).asSeconds()
  ) {
    await context.reply(
      "⚠️ Видео в выбранном качестве слишком долго обрабатывать, попробуй уменьшить качество или выбрать аудио",
      { disable_notification: true }
    );
  } else if (videoTranslateProgressCount >= 1) {
    await context.reply(
      "⚠️ Максимальное количество видео в процессе 🏗 перевода в данный момент, пожалуйста, 🔁 повторите позже..."
    );
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
    progressInterval = setInterval(async () => {
      try {
        await handleTranslateInProgress(context, ffmpegProgress);
      } catch (error) {
        clearInterval(progressInterval);
        await handleError(error, context);
      }
    }, moment.duration({ minutes: 5 }).asMilliseconds());

    logger.info("Request translation...");
    let translationUrl: string; //| undefined;
    try {
      const videoTranslateData = await translateVideoFinal(videoLink);
      translationUrl = videoTranslateData.url;
    } catch (error) {
      // if (error instanceof Error) {
      if (error instanceof TranslateException) {
        if (error.message) {
          const YANDEX_TRANSLATE_ERROR_MESSAGE =
            "Возникла ошибка, попробуйте позже";
          if (error.message === YANDEX_TRANSLATE_ERROR_MESSAGE) {
            await context.reply(
              "⚠️ Не получается перевести это видео, 😢 к сожалению, ничего не поделать. 🕔 Может в будущем получится"
            );
            return;
          }

          await context.reply(`⚠️ Ошибка переводчика: ${error.message}`);
          return;
        }

        await context.reply(
          "⚠️ Возникла ошибка при переводе. Информация ✉️ передана разработчикам, попробуй позже"
        );
        return;
      }
      throw error;
    }
    logger.info(`Translated: ${translationUrl}`);

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
        videoTitle = await translateText(videoTitle, "ru");
        logger.info(`Translated video title to russian: ${videoTitle}`);
      } catch (error) {
        logger.warn("Unable to translate video title:", error);
      }
    }

    const videoThumbnailUrl = videoInfo.thumbnail;
    let thumbnailBuffer: Buffer | undefined;
    if (videoThumbnailUrl) {
      thumbnailBuffer = await getVideoThumbnail(videoThumbnailUrl);
    }
    const originalArtist = videoInfo.artist;
    let artist = originalArtist;
    if (artist) {
      try {
        // const translateResponse = await translate(artist, {
        //   to: "ru",
        // });
        // artist = translateResponse.text;
        artist = await translateText(artist, "ru");
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

    if (translateAction.translateType === TranslateType.Voice) {
      const outputBuffer = translateAudioBuffer;
      outputBuffer.name = `${videoTitle}.mp3`;

      const telegramClient = await getClient();
      const fileMessage = await telegramClient.sendFile(
        STORAGE_CHANNEL_CHAT_ID,
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
              performer: artist
                ? `${artist} (${originalArtist})`
                : "Unknown artist",
            }),
            // new Api.DocumentAttributeFilename({
            //   fileName: "mqdefault.jpg",
            // }),
          ],
        }
      );
      await context.telegram.copyMessage(
        context.chat?.id ?? 0,
        STORAGE_CHANNEL_CHAT_ID,
        fileMessage.id
      );
      return;
    }

    const youtubeVideoFormatItag =
      translateQualityToYoutubeVideoFormatItag[translateAction.quality];

    if (
      videoInfo.formats?.findIndex(
        (videoFormat) => videoFormat.itag === youtubeVideoFormatItag.video
      ) === -1
    ) {
      await context.reply(
        "⚠️ Выбранный формат видео для перевода не найден, попробуйте другой."
      );
      return;
    }
    if (
      videoInfo.formats?.findIndex(
        (videoFormat) => videoFormat.itag === youtubeVideoFormatItag.audio
      ) === -1
    ) {
      await context.reply(
        "⚠️ Выбранный формат аудио для перевода не найден, попробуйте другой."
      );
      return;
    }

    // logger.log(
    //   `Requesting download stream for quality ${youtubeVideoFormatItag.video} ...`
    // );
    const videoStream = ytdl(videoLink, {
      // quality: youtubeVideoFormatItag.video,
      quality: 18,
      agent: ytdlAgent,
    });
    // logger.log(
    //   `Requesting download stream for quality ${youtubeVideoFormatItag.audio} ...`
    // );
    // const audioStream = ytdl(videoLink, {
    //   quality: youtubeVideoFormatItag.audio,
    //   agent: ytdlAgent,
    // });
    logger.info("Downloading youtube video stream...");
    const videoBuffer = await streamToBuffer(videoStream);
    // const audioBuffer = await streamToBuffer(audioStream);
    logger.info(`Youtube video downloaded: ${videoBuffer.length}`);

    if (!ffmpeg.isLoaded()) {
      logger.info("Loading ffmpeg...");
      await ffmpeg.load();
      logger.info("FFmpeg loaded");
    }
    ffmpeg.setLogger(({ message }) => logger.info(message));
    ffmpeg.setProgress(({ ratio }) => {
      ffmpegProgress = ratio;
    });

    const videoFilePath = "source.mp4";
    const audioFilePath = "source2.mp3";
    const translateAudioFilePath = "source3.mp3";

    ffmpeg.FS("writeFile", videoFilePath, videoBuffer);
    // ffmpeg.FS("writeFile", audioFilePath, audioBuffer);
    ffmpeg.FS("writeFile", translateAudioFilePath, translateAudioBuffer);

    let fileMessageId = 0;
    await {
      [TranslateType.Voice]: async () => {},
      [TranslateType.Audio]: async () => {
        const resultFilePath = "audio.mp3";

        // prettier-ignore
        await ffmpeg.run(
          "-i", videoFilePath,
          "-i", translateAudioFilePath,

          "-filter_complex",
            `[0:a]volume=${percent(10)}[a];` + // 10% original playback
            `[1:a]volume=${percent(100)}[b];` + // voice over
            '[a][b]amix=inputs=2:dropout_transition=0', // :duration=longest',

          // "-qscale:a", "9", // "4",
          // "-codec:a", "libmp3lame", // "aac",
          "-b:a", "64k", // decrease output size (MB) - default 128kb
          "-ac", "1", // decrease audio channel stereo to mono
          // " -pre", "ultrafast",

          resultFilePath,
        );
        // ffmpeg -i input.mp4 -f null /dev/null

        logger.info("Getting ffmpeg output in node environment");
        const outputFile = ffmpeg.FS("readFile", resultFilePath);
        const outputBuffer = Buffer.from(outputFile);
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

        const telegramClient = await getClient();
        const fileMessage = await telegramClient.sendFile(
          STORAGE_CHANNEL_CHAT_ID,
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
        fileMessageId = fileMessage.id;

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
      [TranslateType.Video]: async () => {
        const resultFilePath = "video.mp4";

        // prettier-ignore
        await ffmpeg.run(
          "-i", videoFilePath,
          // "-i", audioFilePath,
          "-i", translateAudioFilePath,

          "-filter_complex",
            `[0:a]volume=${percent(10)}[a];` + // 10% original playback
            `[1:a]volume=${percent(100)}[b];` + // voice over
            '[a][b]amix=inputs=2:dropout_transition=0', // :duration=longest',

          // "-qscale:a", "9", // "4",
          // "-codec:a", "libmp3lame", // "aac",
          // "-b:a", "64k", // decrease output size (MB) - default 128kb
          // " -pre", "ultrafast",

          resultFilePath,
        );

        const outputFile = ffmpeg.FS("readFile", resultFilePath);
        const outputBuffer: Buffer | null = Buffer.from(outputFile);
        outputBuffer.name = `${videoTitle}.mp4`;

        const telegramClient = await getClient();
        const fileMessage = await telegramClient.sendFile(
          STORAGE_CHANNEL_CHAT_ID,
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
        fileMessageId = fileMessage.id;
      },
      [TranslateType.ChooseVideoQuality]: async () => {},
    }[translateAction.translateType]();
    logger.info("Uploaded to telegram");

    await context.telegram.copyMessage(
      context.chat?.id ?? 0,
      STORAGE_CHANNEL_CHAT_ID,
      fileMessageId
    );
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
    await context.reply(
      "⚠️ На данный момент поддерживается только YouTube, можете попробовать 📤 загрузить это видео на ютуб и прислать 🔗 ссылку",
      { disable_notification: true }
    );
  } else {
    await context.reply(
      "⚠️ На данный момент поддерживается только YouTube, пришлите 🔗 ссылку на видео для перевода",
      { disable_notification: true }
    );
  }
});

export { bot } from "./botinstance";
