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
import { Readable, Stream } from "stream";
import fs from "fs/promises";
import ytdl from "ytdl-core";
import { createFFmpeg } from "@ffmpeg/ffmpeg";
import FormData from "form-data";
import path from "path";
import http from "http";
import https from "https";
import { sendAdminNotification } from "./notification";

dotenv.config({ path: "./.env" });

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
  /http(?:s?):\/\/(?:www\.)?youtu(?:be\.com\/watch\?v=|\.be\/)([\w\-\_]*)(&(amp;)?[\w\?=]*)?/g;

const getLink = (text: string) => {
  let link = text.match(LINK_REGEX)?.[0];
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

const UPLOADER_URL = (
  NODE_ENV === "development"
    ? process.env.UPLOADER_URL_DEV
    : process.env.UPLOADER_URL_PROD
) as string;

const BOT_TIMEOUT = 30 * 60 * 1000;

export const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: BOT_TIMEOUT });

bot.use(async (context, next) => {
  let typingInterval: NodeJS.Timer | undefined;
  try {
    await context.sendChatAction("typing");
    typingInterval = setInterval(
      async () => await context.sendChatAction("typing"),
      5000
    );

    await next();
  } finally {
    clearInterval(typingInterval);
  }
});

bot.catch(async (error, context) => {
  console.error(error);
  await Promise.allSettled([
    context.sendMessage(
      "Ошибка! Попробуй еще раз 🔁, или сообщи об этом @nezort11 (буду рад помочь 😁)"
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

    console.log("Downloading tranlation...");
    const audioResponse = await axiosInstance.get<ArrayBuffer>(translationUrl, {
      responseType: "arraybuffer",
      // responseType: "stream",
    });
    const audioBuffer = Buffer.from(audioResponse.data);
    console.log("Downloaded translation: ");

    await fs.writeFile("./audio.mp3", audioBuffer);

    // const audioStream = audioResponse.data;
    // const audioStream = Readable.from(audioBuffer);

    const audioDuration = await getAudioDurationInSeconds("./audio.mp3");

    console.log("duration: ", audioDuration);

    console.log("Requesting video page to get title...");
    const resourceTitle = await getWebsiteTitle(url.href);

    let resourceThumbnailUrl: string | undefined;
    // if (YOUTUBE_LINK_REGEX.test(url.href)) {

    let link = url.href;
    let artist: string | undefined;
    let outputBuffer = audioBuffer;
    const videoId = Array.from(url.href.matchAll(YOUTUBE_LINK_REGEX))?.[0]?.[1];

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
      console.log("author name: ", authorName);

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

      const ffmpeg = createFFmpeg({
        log: true,
        corePath: path.resolve("../ffmpeg-dist/ffmpeg-core.js"),
        workerPath: path.resolve("../ffmpeg-dist/ffmpeg-core.worker.js"),
        wasmPath: path.resolve("../ffmpeg-dist/ffmpeg-core.wasm"),
      });
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
    }
    // }
    console.log("resource thumbnail: ", resourceThumbnailUrl);

    // await context.sendAudio(
    //   {
    //     source: translationBuffer,
    //     ...(resourceTitle ? { filename: resourceTitle } : {}),
    //   },
    //   {
    //     ...(resourceTitle ? { title: resourceTitle } : {}),
    //   }
    // );

    const form = new FormData({ maxDataSize: 20971520 });
    form.append("file", outputBuffer, "audio.mp3");
    form.append("duration", Math.floor(audioDuration));
    form.append("title", resourceTitle ?? "");
    form.append("artist", artist ?? "");
    form.append("caption", link);
    form.append("thumbnail", resourceThumbnailUrl ?? "");

    console.log("Uploading to telegram channel...");
    const uploadResponse = await axiosInstance.post<UploadResponse>(
      UPLOADER_URL,
      // {
      //   file: audioBuffer.toString("base64"),
      //   // file: translationUrl,
      //   duration: Math.floor(audioDuration),
      //   title: resourceTitle ?? "",
      //   artist: artist ?? "",
      //   caption: link,
      //   thumbnail: resourceThumbnailUrl ?? "",
      // }
      form,
      {
        headers: { ...form.getHeaders() },
      }
    );
    console.log("Uploaded to telegram");

    const chatId = uploadResponse.data.chat_id;
    const messageId = uploadResponse.data.message_id;
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
