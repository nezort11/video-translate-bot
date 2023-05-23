import process from "process";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import * as dotenv from "dotenv";
import {
  TranslateException,
  TranslateInProgressException,
  getVoiceTranslate,
} from "./translate";
import axios from "axios";
import { load } from "cheerio";
import { getAudioDurationInSeconds } from "get-audio-duration";
import fs from "fs/promises";
import ytdl from "ytdl-core";
import { createFFmpeg } from "@ffmpeg/ffmpeg";
import path from "path";
import http from "http";
import https from "https";
import { sendAdminNotification } from "./notification";
import { getClient } from "./telegramClient";
import { Api } from "telegram";
import { telegrafThrottler } from "telegraf-throttler";
import Bottleneck from "bottleneck";
import translate from "@iamtraction/google-translate";

dotenv.config({ path: "./.env" });

export const getChatId = (id: string) => {
  return `-100${id}`;
};

const STORAGE_CHANNEL_ID = process.env.STORAGE_CHANNEL_ID as string;
const STORAGE_CHANNEL_CHAT_ID = getChatId(STORAGE_CHANNEL_ID);

const LOGGING_CHANNEL_ID = process.env.LOGGING_CHANNEL_ID as string;
const LOGGING_CHANNEL_CHAT_ID = getChatId(LOGGING_CHANNEL_ID);

const AXIOS_REQUEST_TIMEOUT = 45 * 60 * 1000; // 45 min

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

type UploadResponse = {
  chat_id: string;
  message_id: number;
};

const LINK_REGEX = /(?:https?:\/\/)?(?:www\.)?\w+\.\w{2,}(?:\/\S*)?/gi;
const YOUTUBE_LINK_REGEX =
  /((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube(-nocookie)?\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|live\/|v\/)?)([\w\-]+)(\S+)?/g;

const getLink = (text: string) => {
  // Youtube link is higher priority than regular link
  let link = text.match(YOUTUBE_LINK_REGEX)?.[0] || text.match(LINK_REGEX)?.[0];
  if (!link) {
    return;
  }
  if (!link.startsWith("http")) {
    return `https://${link}`;
  }
  return link;
};

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout((_) => resolve(undefined), milliseconds));

const TRANSLATE_PULLING_INTERVAL = 15 * 1000; // seconds

const getVoiceTranslateFinal = async (url: string): Promise<string> => {
  try {
    return await getVoiceTranslate(url);
  } catch (error) {
    if (error instanceof TranslateInProgressException) {
      await delay(TRANSLATE_PULLING_INTERVAL);
      console.log("Rerequesting translation");
      return await getVoiceTranslateFinal(url);
    }
    throw error;
  }
};

const getWebsiteTitle = async (url: string) => {
  try {
    const resourceResponse = await axiosInstance.get(url);
    const $ = load(resourceResponse.data);
    let title = $("title").text();

    if (title.endsWith("YouTube")) {
      title = title.split(" - YouTube")[0];
    }

    console.log("Title is:", title);
    return title;
  } catch (error) {
    console.log(error);
    return;
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

const NODE_ENV = process.env.NODE_ENV;
const BOT_TOKEN = (
  NODE_ENV === "development"
    ? process.env.BOT_TOKEN_DEV
    : process.env.BOT_TOKEN_PROD
) as string;

// const UPLOADER_URL = (
//   NODE_ENV === "development"
//     ? process.env.UPLOADER_URL_DEV
//     : process.env.UPLOADER_URL_PROD
// ) as string;

const BOT_TIMEOUT = 120 * 60 * 1000; // 2h

export const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: BOT_TIMEOUT });

const ffmpeg = createFFmpeg({
  log: true,
  // corePath: path.resolve("../ffmpeg-dist/ffmpeg-core.js"),
  // workerPath: path.resolve("../ffmpeg-dist/ffmpeg-core.worker.js"),
  // wasmPath: path.resolve("../ffmpeg-dist/ffmpeg-core.wasm"),
});

bot.use(async (context, next) => {
  // Disable chat bot in channels/groups
  if (context.chat?.type !== "private") {
    return;
  }

  await next();
});

const throttler = telegrafThrottler({
  // Config credit: https://github.com/KnightNiwrem/telegraf-throttler/blob/master/src/index.ts#L37
  group: {
    maxConcurrent: 1,
    minTime: 333,
    reservoir: 20,
    reservoirRefreshAmount: 20,
    reservoirRefreshInterval: 60000,
  },
  in: {
    highWater: 16, // can only translate 8 videos in the queue
    strategy: Bottleneck.strategy.LEAK,
    // TODO: fix why it still does 2 concurrently
    maxConcurrent: 1, // only translate 1 video at the same time because of low server
    minTime: 333,
  },
  out: {
    // https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this
    maxConcurrent: 1,
    minTime: 25,
    reservoir: 30,
    reservoirRefreshAmount: 30,
    reservoirRefreshInterval: 1000,
  },
});
bot.use(throttler);

bot.use(async (context, next) => {
  let typingInterval: NodeJS.Timer | undefined;
  try {
    if (!context.callbackQuery) {
      await context.sendChatAction("typing");

      typingInterval = setInterval(
        async () => await context.sendChatAction("typing"),
        5000
      );

      // context.forwardMessage(LOGGING_CHANNEL_CHAT_ID);
    }

    await next();
  } finally {
    clearInterval(typingInterval);
  }
});

bot.catch(async (error, context) => {
  console.error(error);
  await Promise.allSettled([
    context.sendMessage(
      "⚠️ Ошибка! Попробуй еще раз 🔁 чуть позже, или сообщи об этом @nezort11 (всегда рад помочь 😁). Информация об ошибке уже передана ✉️"
    ),
    sendAdminNotification(
      `${(error as Error)?.stack || error}\n\nMessage: ${JSON.stringify(
        context.message
      )}`
    ),
  ]);
});

bot.start(async (context) => {
  await context.reply(
    "Привет 👋. Пришли мне ссылку 🔗 на видео или аудио и я попробую перевести его 🔊 (к примеру https://youtu.be/8pDqjafNa44 ⏯, twitter.com/i/status/16248163632571853826 и др.)."
    //  Я поддерживаю много различных платформ / соцсетей / сайтов, а также простые ссылки для видео / аудио.
    // Перевожу не только с английского, но и с многих других языков"
  );

  // await context.reply("⁣", {
  //   reply_markup: {
  //     inline_keyboard: [
  //       [{ text: "Open", web_app: { url: "https://youtube.com" } }],
  //     ],
  //   },
  // });
});

bot.command("do", async (context) => {
  await bot.telegram.copyMessage(
    524215438,
    "@vnkszljixhbrqpdfwztceeyomlnauhgm",
    88
  );
});

bot.command("test", async (context) => {
  const youtubeReadableStream = ytdl(
    "https://www.youtube.com/watch?v=5weFyMoBGN4"
    // { filter: "audio" }
    // { filter: "audioonly" }
  );

  const translationUrl = await getVoiceTranslateFinal(
    "https://www.youtube.com/watch?v=5weFyMoBGN4"
  );
  const audioResponse = await axiosInstance.get<ArrayBuffer>(translationUrl, {
    responseType: "arraybuffer",
    // responseType: "stream",
  });
  const audioBuffer = Buffer.from(audioResponse.data);

  // let ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

  const streamChunks: Uint8Array[] = [];
  for await (const data of youtubeReadableStream) {
    streamChunks.push(data);
  }
  const youtubeBuffer = Buffer.concat(streamChunks);

  // await fs.writeFile("./output.mp4", youtubeBuffer);

  const ffmpeg = createFFmpeg({
    log: true,
    corePath: path.resolve("../ffmpeg-dist/ffmpeg-core.js"),
    workerPath: path.resolve("../ffmpeg-dist/ffmpeg-core.worker.js"),
    wasmPath: path.resolve("../ffmpeg-dist/ffmpeg-core.wasm"),
  });
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }

  ffmpeg.FS("writeFile", "source.mp4", youtubeBuffer);
  ffmpeg.FS("writeFile", "source2.mp3", audioBuffer);
  // prettier-ignore
  await ffmpeg.run(
    "-i", "source.mp4",

    "-i", "source2.mp3",
    "-filter_complex", '[0:a]volume=0.25[a];' +
                        '[1:a]volume=1[b];' +
                        '[a][b]amix=inputs=2:dropout_transition=0',  // :duration=longest',

    // "-qscale:a", "9", // "4",
    // "-codec:a", "libmp3lame", // "aac",
    // "-b:a", "64k",
    // " -pre", "ultrafast",

    "output.mp3"
  );
  // ffmpeg -i input.mp4 -f null /dev/null
  // ffmpeg -i ./input.mp4 -i input2.mp3 -filter_complex "[0:a]volume=0.25[a];[1:a]volume=1[b];[a][b]amix=inputs=2:duration=longest" -c:a libmp3lame -q:a 4 -y output_audio.mp3
  const outputFile = ffmpeg.FS("readFile", "output.mp3");

  let outputBuffer: Buffer | null = Buffer.from(outputFile);

  await context.replyWithAudio({
    source: outputBuffer,
    // source: youtubeBuffer,
    // source: youtubeReadableStream,
    filename: "audio.mp3",
  });

  outputBuffer = null;
});

bot.command("foo", async (context) => {
  // await context.replyWithAudio({ source: "./hymn.mp3" });
  await context.replyWithAudio(
    {
      source:
        "/Users/egorzorin/dev/python/webdev/test-yandex-serverless-container/src/hymn.mp3",
      filename: "hymn.mp3",
    },
    {
      title: "hello world",
      performer: "New performer",
      thumb: {
        source:
          "/Users/egorzorin/dev/python/webdev/test-yandex-serverless-container/src/cover.jpg",
      },
    }
    //
  );

  // await context.reply(await getVoiceTranslate("https://youtu.be/8pDqJVdNa44"));
  // await context.forwardMessage(context.chat.id, {  })
  // context.forwardMessage()
  // await bot.telegram.forwardMessage(context.chat.id, "@blablatest2", 3);
  // await bot.telegram.copyMessage(context.chat.id, 1436716301, 2);
  // await context.sendPhoto("-6657797204282829097");
});

bot.on(message("text"), async (context) => {
  console.log("Incoming translate request:", context);

  let url: URL;
  try {
    const link = getLink(context.message.text);
    url = new URL(link ?? "");
  } catch (error) {
    await context.reply("Пожалуйста предоставь ссылку на ресурс для перевода");
    return;
  }

  try {
    let translationUrl: string | undefined;
    try {
      console.log("Request translation...");
      translationUrl = await getVoiceTranslateFinal(url.href);
    } catch (error) {
      if (error instanceof TranslateException) {
        if (error.message) {
          await context.reply(error.message);
          return;
        }
        await context.reply("Ошибка при переводе!");
        return;
      }
      throw error;
    }

    console.log("Translated:", translationUrl);

    console.log("Downloading translation...");
    const audioResponse = await axiosInstance.get<ArrayBuffer>(translationUrl, {
      responseType: "arraybuffer",
      // responseType: "stream",
    });
    const audioBuffer = Buffer.from(audioResponse.data);
    console.log("Downloaded translation:", audioBuffer.length);

    await fs.writeFile("./audio.mp3", audioBuffer);

    // const audioStream = audioResponse.data;
    // const audioStream = Readable.from(audioBuffer);

    const audioDuration = await getAudioDurationInSeconds("./audio.mp3");

    console.log("Duration:", audioDuration);

    console.log("Requesting video page to get title...");
    let resourceTitle = await getWebsiteTitle(url.href);
    if (resourceTitle) {
      try {
        const translateResponse = await translate(resourceTitle, { to: "ru" });
        resourceTitle = translateResponse.text;
      } catch (error) {}
    }

    let resourceThumbnailUrl: string | undefined;
    // if (YOUTUBE_LINK_REGEX.test(url.href)) {

    let link = url.href;
    let artist: string | undefined;
    let outputBuffer = audioBuffer;
    const youtubeMatch = Array.from(link.matchAll(YOUTUBE_LINK_REGEX));
    const videoId = youtubeMatch?.[0]?.[6];

    if (videoId) {
      resourceThumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      link = `https://youtu.be/${videoId}`;

      console.log("Requesting video page to get author/channel name...");
      const youtubeResponse = await axiosInstance.get(link);
      const $ = load(youtubeResponse.data);
      const authorName = $('span[itemprop="author"] [itemprop="name"]').attr(
        "content"
      );
      artist = authorName?.toString();

      if (artist) {
        try {
          const translateResponse = await translate(artist, { to: "ru" });
          artist = translateResponse.text;
        } catch (error) {}
      }

      console.log("Author name:", authorName);

      const youtubeReadableStream = ytdl(
        link,
        { filter: "audio" }
        // { filter: "audioonly" }
      );

      const streamChunks: Uint8Array[] = [];
      console.log("Downloading youtube video stream...");
      for await (const data of youtubeReadableStream) {
        streamChunks.push(data);
      }
      const youtubeBuffer = Buffer.concat(streamChunks);

      if (!ffmpeg.isLoaded()) {
        console.log("Loading ffmpeg...");
        await ffmpeg.load();
        console.log("FFmpeg loaded");
      }

      ffmpeg.FS("writeFile", "source.mp4", youtubeBuffer);
      ffmpeg.FS("writeFile", "source2.mp3", audioBuffer);
      // prettier-ignore
      await ffmpeg.run(
        "-i", "source.mp4",

        "-i", "source2.mp3",
        "-filter_complex", '[0:a]volume=0.25[a];' + // 25% (30%/35%/40%) original playback
                            '[1:a]volume=1[b];' + //  voice over
                            '[a][b]amix=inputs=2:dropout_transition=0',  // :duration=longest',

        // "-qscale:a", "9", // "4",
        // "-codec:a", "libmp3lame", // "aac",
        "-b:a", "64k", // decrease output size (MB) - default 128kb
        // " -pre", "ultrafast",

        "output.mp3"
      );
      // ffmpeg -i input.mp4 -f null /dev/null
      // ffmpeg -i ./input.mp4 -i input2.mp3 -filter_complex "[0:a]volume=0.25[a];[1:a]volume=1[b];[a][b]amix=inputs=2:duration=longest" -c:a libmp3lame -q:a 4 -y output_audio.mp3
      console.log("Getting ffmpeg output in node environment");
      const outputFile = ffmpeg.FS("readFile", "output.mp3");

      outputBuffer = Buffer.from(outputFile);
      // @ts-expect-error telegraf uses non-standard Buffer.`name` property
      outputBuffer.name = "audio.mp3";
    }
    // }
    console.log("Resource thumbnail:", resourceThumbnailUrl);

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

    const thumbnailResponse = await axiosInstance.get<ArrayBuffer>(
      resourceThumbnailUrl as string,
      {
        responseType: "arraybuffer",
      }
    );
    const thumbnailBuffer = Buffer.from(thumbnailResponse.data);
    // @ts-expect-error telegraf uses non-standard Buffer.`name` property
    thumbnailBuffer.name = "mqdefault.jpg";

    // await fs.writeFile("./thumb.jpg", thumbnailBuffer);

    console.log("Uploading to telegram channel...");

    const telegramClient = await getClient();
    const { id: fileMessageId } = await telegramClient.sendFile(
      STORAGE_CHANNEL_CHAT_ID,
      {
        file: outputBuffer,
        caption: link,
        // thumb: path.resolve("./thumb.jpg"),
        thumb: thumbnailBuffer,
        // thumb: "/Users/egorzorin/Downloads/response.jpeg",

        attributes: [
          new Api.DocumentAttributeAudio({
            duration: Math.floor(audioDuration),
            title: resourceTitle,
            performer: artist,
          }),
          new Api.DocumentAttributeFilename({
            fileName: "mqdefault.jpg",
          }),
          new Api.DocumentAttributeVideo({
            w: 320,
            h: 180,
            duration: Math.floor(audioDuration),
          }),
        ],
      }
    );

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
    console.log("Uploaded to telegram");

    // const chatId = uploadResponse.data.chat_id;
    // const messageId = uploadResponse.data.message_id;
    const chatId = STORAGE_CHANNEL_CHAT_ID;
    const messageId = fileMessageId;
    await bot.telegram.copyMessage(context.chat.id, chatId, messageId);
  } catch (error) {
    throw error;
  }

  // await context.reply(url.href, {
  //   reply_markup: {
  //     inline_keyboard: [[{ text: "Open", web_app: { url: url.href } }]],
  //   },
  // });
});
