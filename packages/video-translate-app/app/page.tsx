"use client"; // only skip SSR, left with SSG
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import logoImg from "./images/logo.jpg";

import axios from "axios";
// import { createFFmpeg } from "@ffmpeg/ffmpeg";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCallback, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  isTMA,
  mockTelegramEnv,
  retrieveLaunchParams,
} from "@telegram-apps/bridge";
import { init, backButton } from "@telegram-apps/sdk-react";
import { openTelegramLink, requestWriteAccess } from "@telegram-apps/sdk";

const initialize = async () => {
  mockTelegramEnv({
    themeParams: {
      accentTextColor: "#6ab2f2",
      bgColor: "#17212b",
      buttonColor: "#5288c1",
      buttonTextColor: "#ffffff",
      destructiveTextColor: "#ec3942",
      headerBgColor: "#17212b",
      hintColor: "#708499",
      linkColor: "#6ab3f3",
      secondaryBgColor: "#232e3c",
      sectionBgColor: "#17212b",
      sectionHeaderTextColor: "#6ab3f3",
      subtitleTextColor: "#708499",
      textColor: "#f5f5f5",
    },
    initData: {
      user: {
        id: 776696185,
        firstName: "Andrew",
        lastName: "Rogue",
        username: "rogue",
        languageCode: "en",
        isPremium: true,
        // allowsWriteToPm: true,
        allowsWriteToPm: true,
      },
      hash: "89d6079ad6762351f38c6dbbc41bb53048019256a9443988af7a48bcad16ba31",
      authDate: new Date(1716922846000),
      signature: "abc",
      startParam: "debug",
      chatType: "sender",
      chatInstance: "8428209589180549439",
    },
    initDataRaw: new URLSearchParams([
      [
        "user",
        JSON.stringify({
          id: 776696185,
          first_name: "Andrew",
          last_name: "Rogue",
          username: "rogue",
          language_code: "en",
          is_premium: true,
          // allows_write_to_pm: true,
          allows_write_to_pm: true,
        }),
      ],
      [
        "hash",
        "89d6079ad6762351f38c6dbbc41bb53048019256a9443988af7a48bcad16ba31",
      ],
      ["auth_date", "1716922846"],
      ["start_param", "debug"],
      ["signature", "abc"],
      ["chat_type", "sender"],
      ["chat_instance", "8428209589180549439"],
    ]).toString(),
    version: "7.2",
    platform: "tdesktop",
  });

  // Dynamically add eruda
  // if (process.env.NODE_ENV === "development") {
  await import("./eruda");
  // }

  const isTma = await isTMA();
  if (isTma) {
    init();

    const launchParams = retrieveLaunchParams();
    console.log("launch params", launchParams);

    backButton.mount();
  }
};

if (typeof window !== "undefined") {
  initialize();
}

// downloadFile;

const YOUTUBE_LINK_REGEX =
  /((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube(-nocookie)?\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|live\/|shorts\/|v\/)?)([\w\-]+)(\S+)?/g;

const formSchema = z.object({
  link: z
    .string()
    .url()
    .regex(
      YOUTUBE_LINK_REGEX,
      "На данный момент полноценный перевод видео поддерживается только для YouTube"
    )
    .min(2, {
      message: "Link must be at least 2 characters.",
    }),
});

// export function ProfileForm() {

// }

// const ffmpeg = createFFmpeg({
//   log: true,
//   logger: ({ message }) => console.info(message),
//   // corePath: path.resolve("../ffmpeg-dist/ffmpeg-core.js"),
//   // workerPath: path.resolve("../ffmpeg-dist/ffmpeg-core.worker.js"),
//   // wasmPath: path.resolve("../ffmpeg-dist/ffmpeg-core.wasm"),
// });

const download = (dataUrl: string, filename: string) => {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
};

const percent = (percent: number) => percent / 100;

const TRANSLATE_API_URL = new URL(
  "/translate",
  process.env.NEXT_PUBLIC_VIDEO_TRANSLATE_API_URL!
).href;

const DOWNLOAD_API_URL = new URL(
  "/download",
  process.env.NEXT_PUBLIC_VIDEO_TRANSLATE_API_URL!
).href;

const UPLOAD_API_URL = new URL(
  "/upload",
  process.env.NEXT_PUBLIC_VIDEO_TRANSLATE_API_URL!
).href;

const SEND_API_URL = new URL(
  "/send",
  process.env.NEXT_PUBLIC_VIDEO_TRANSLATE_API_URL!
).href;

export type VideoTranslateResponseData = {
  url: string;
  duration: number;
  status: number;
  code: string;
  message?: string;
};

export type VideoDownloadResponseData = {
  url: string;
  length: number;
};

export type VideoUploadResponseData = {
  url: string;
};

const translateVideo = async (videoLink: string) => {
  const translatedAudioResponse = await axios.post<VideoTranslateResponseData>(
    TRANSLATE_API_URL,
    null,
    {
      params: {
        url: videoLink,
      },
    }
  );

  return translatedAudioResponse;
};

const TRANSLATE_PULLING_INTERVAL = 15 * 1000; // seconds;

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(() => resolve(undefined), milliseconds));

const translateVideoAwait = async (
  videoLink: string
): Promise<VideoTranslateResponseData> => {
  console.log("Requesting translation...");
  const translatedAudioResponse = await translateVideo(videoLink);

  if (translatedAudioResponse.status === 202) {
    console.info("Translation in progress...");
    await delay(TRANSLATE_PULLING_INTERVAL);

    return await translateVideoAwait(videoLink);
  }
  return translatedAudioResponse.data;
};

const VIDEO_TRANSLATE_ERROR =
  "Проблема при попытке переводе видео. Попробуй еще раз или немного позже";

export default function Home() {
  // 1. Define your form.
  const { toast } = useToast();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      link: "",
    },
  });
  // 0% - indeterminate progress bar, other% - determinate
  const [translateProgress, setTranslateProgress] = useState<
    number | undefined
  >();
  const [resultFileUrl, setResultFileUrl] = useState<string | undefined>();

  const translateVideo = async (values: z.infer<typeof formSchema>) => {
    let translatedAudioResponse;
    try {
      translatedAudioResponse = await translateVideoAwait(values.link);
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        error.response &&
        error.response.status >= 400 &&
        error.response.status <= 499
      ) {
        form.setError("link", {
          message:
            "Не получается перевести данное видео, попробуйте в будущем или переведите другое видео",
        });
        return;
      } else {
        throw error;
      }
    }
    console.log(translatedAudioResponse);
    const translatedAudioUrl = translatedAudioResponse.url;

    const translatedAudioBufferResponse = await axios.get<ArrayBuffer>(
      translatedAudioUrl,
      {
        responseType: "arraybuffer",
      }
    );
    const translatedAudioBuffer = translatedAudioBufferResponse.data;
    const translatedAudioBufferIntArray = new Uint8Array(translatedAudioBuffer);
    console.log("translated audio length", translatedAudioBuffer.byteLength);

    console.log("Requesting video download...");
    const videoBufferResponse = await axios.post<VideoDownloadResponseData>(
      DOWNLOAD_API_URL,
      null,
      {
        params: {
          url: values.link,
          format: 18,
        },
      }
    );
    console.log("videoBufferResponse", videoBufferResponse);

    console.log("Downloading video...");
    const videoResponse = await axios.get<ArrayBuffer>(
      videoBufferResponse.data.url,
      {
        responseType: "arraybuffer",
      }
    );
    const videoBuffer = videoResponse.data;
    const videoIntArray = new Uint8Array(videoBuffer);
    console.log("video buffer length", videoBuffer.byteLength);

    const ffmpeg = new FFmpeg();
    // let ffmpegProgress = 0;
    // if (!ffmpeg.isLoaded()) {
    if (!ffmpeg.loaded) {
      console.info("Loading ffmpeg...");
      // await ffmpeg.load();
      await ffmpeg.load({
        // log: true,
        // logger: ({ message }) => console.info(message),
      });
      console.info("FFmpeg loaded");
    }
    // ffmpeg.setLogger(({ message }) => console.info(message));
    ffmpeg.on("log", ({ message }) => {
      console.log("ffmpeg message", message);
    });
    // ffmpeg.setProgress(({ ratio }) => {
    //   // ffmpegProgress = ratio;
    //   console.log("ffmpeg progress", ratio);
    // });
    ffmpeg.on("progress", ({ progress }) => {
      console.log("ffmpeg progress", progress);

      setTranslateProgress(Math.round(progress * 100));
    });

    const videoFilePath = "source.mp4";
    // const audioFilePath = "source2.mp3";
    const translateAudioFilePath = "source3.mp3";

    console.log("Writing files to the ffmpeg fs...");
    try {
      // ffmpeg.FS("writeFile", videoFilePath, videoBuffer);
      await ffmpeg.writeFile(videoFilePath, videoIntArray);
      // ffmpeg.FS("writeFile", audioFilePath, audioBuffer);
      await ffmpeg.writeFile(
        translateAudioFilePath,
        translatedAudioBufferIntArray
      );
    } catch (error) {
      console.error("ffmpeg fs error", error);
      throw error;
    }
    console.log("Files written to the ffmpeg fs");

    const resultFilePath = "video.mp4";

    console.log("Executing ffmpeg command...");
    // prettier-ignore
    // await ffmpeg.run(
    await ffmpeg.exec([
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
    ]);
    console.log("Executed ffmpeg command");
    // ffmpeg -i input.mp4 -f null /dev/null

    // const videoTitle = "outputAudio";

    console.info("Getting ffmpeg result in node environment");
    // const outputFile = ffmpeg.FS("readFile", resultFilePath);
    const resultFile = await ffmpeg.readFile(resultFilePath);
    // const outputBuffer = Buffer.from(outputFile);
    console.log("result int array length", resultFile.length);

    const resultBlob = new Blob([resultFile], { type: "video/mp4" });

    setTranslateProgress(0);

    // outputBuffer.name = `${videoTitle}.mp3`;
    const isTma = await isTMA();
    if (isTma) {
      try {
        await requestWriteAccess();
      } catch (error) {
        console.warn(error);
      }
    }
    console.log("is inside telegram mini app!");

    const writeAccessAvailable = requestWriteAccess.isAvailable();
    console.log("write access available: ", writeAccessAvailable);

    if (
      isTma
      // && writeAccessAvailable
    ) {
      console.log("requesting upload url...");
      const videoStorageResponse = await axios.post<VideoUploadResponseData>(
        UPLOAD_API_URL
      );
      const videoStorageUrl = videoStorageResponse.data.url;
      console.log("uploading translate result to the bucket...");
      await axios.put(videoStorageUrl, resultBlob, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": resultBlob.size,
        },
      });

      const videoStorageKey = new URL(videoStorageUrl).pathname.slice(1);
      console.log("uploaded to storage", videoStorageKey);

      const launchParams = retrieveLaunchParams();
      const tmaChatId = launchParams.initData!.user!.id;
      console.log(`sending uploaded video result to ${tmaChatId} chat...`);
      await axios.post<VideoUploadResponseData>(SEND_API_URL, {
        key: videoStorageKey,
        link: values.link,
        duration: translatedAudioResponse.duration,
        chatId: tmaChatId,
      });
      console.log("sent translate result video to the user");
      console.log("result video storage url", videoStorageUrl);

      toast({
        title: "Переведенное видео было отправлено в чате с ботом",
      });

      if (openTelegramLink.isAvailable()) {
        openTelegramLink("https://t.me/vidtransbot");
      }
    } else {
      setResultFileUrl(URL.createObjectURL(resultBlob));
    }
  };

  // 2. Define a submit handler.
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setTranslateProgress(0);
    setResultFileUrl(undefined);
    try {
      await translateVideo(values);
    } catch (error) {
      form.setError("root", { message: VIDEO_TRANSLATE_ERROR });
      setResultFileUrl(undefined);
      toast({
        title: "Оу упс! Что-то пошло не так.",
        description: VIDEO_TRANSLATE_ERROR,
        // title: "Uh oh! Something went wrong.",
        // description: "There was a problem with your request.",
      });
      console.error("translate error", error);
      throw error;
    } finally {
      setTranslateProgress(undefined);
    }
  };

  const downloadResult = useCallback(() => {
    download(resultFileUrl!, "video.mp4");
  }, [resultFileUrl]);

  return (
    <div className="grid grid-rows-[20px_1fr_20px] sm:min-h-screen sm:items-center justify-items-center font-[family-name:var(--font-geist-sans)]">
      <main className="w-full max-w-screen-sm grid-cols-2 gap-8 row-start-2 items-center sm:items-start p-4 ">
        {/* <Image
          className="dark:invert"
          src="https://nextjs.org/icons/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />
        <ol className="list-inside list-decimal text-sm text-center sm:text-left font-[family-name:var(--font-geist-mono)]">
          <li className="mb-2">
            Get started by editing{" "}
            <code className="bg-black/[.05] dark:bg-white/[.06] px-1 py-0.5 rounded font-semibold">
              app/page.tsx
            </code>
            .
          </li>
          <li>Save and see your changes instantly.</li>
        </ol>

        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <a
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="https://nextjs.org/icons/vercel.svg"
              alt="Vercel logomark"
              width={20}
              height={20}
            />
            Deploy now
          </a>
          <a
            className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:min-w-44"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read our docs
          </a>
        </div> */}

        {/* <div className="gap-2">
          <Input type="url" placeholder="Link to the video" />
          <Button>Translate</Button>
        </div> */}

        <div className="flex items-center gap-2 mb-4">
          <Image
            src={logoImg}
            alt="logo"
            width={32}
            height={32}
            className="avatar aspect-square rounded-full"
          />

          <h1 className="font-bold tracking-tight text-4xl">
            {/* Video translator */}
            Видео Переводчик
          </h1>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="link"
              disabled={form.formState.isSubmitting}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {/* Video Link */}
                    Ссылка на видео
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://youtu.be/HeZf1QDpaOQ"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage>
                    {form.formState.errors.link?.message}
                  </FormMessage>
                  <FormDescription>
                    {/* The URL of the video you want to translate */}
                    URL ссылка на видео, которое Вы хотите перевести
                  </FormDescription>
                  {/* <FormMessage>{field.}</FormMessage> */}
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {/* Submit */}
              Перевести
            </Button>
            <FormMessage>{form.formState.errors.root?.message}</FormMessage>
          </form>
        </Form>

        {translateProgress !== undefined && translateProgress < 100 && (
          <div>
            <Progress
              indeterminate={translateProgress === 0}
              value={translateProgress}
              className="mt-4"
            />
            <p className="text-center">
              {translateProgress ? `${translateProgress}%` : " "}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              *скорость перевода зависит от длины видео, а также от мощности
              Вашего девайса
            </p>
          </div>
        )}

        {/* {outputFileUrl && (
          <audio controls>
            <source
              src={outputFileUrl}
              // src="https://vtrans.s3-private.mds.yandex.net/tts/prod/48115488aa2442d28ba94db5c537feda.mp3?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=WjGREUc47LBUFZn6pllC%2F20241117%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20241117T073939Z&X-Amz-Expires=7200&X-Amz-SignedHeaders=host&X-Amz-Signature=504300ec87b5f3daab9c5b1e305a22d73adf8a3cbe618705430a0ae8639c4f88"
              // type="audio/mpeg"
              type="video/mp4"
            />
          </audio>
        )} */}
        {resultFileUrl && (
          <div>
            <video
              // ref={videoRef}
              src={resultFileUrl}
              controls
              className="mt-4 rounded"
              style={{ width: "100%", height: "auto" }}
            >
              Your browser does not support the video tag.
            </video>
            {/* <p className="text-sm text-muted-foreground mt-2">
              *скачать видео можно по кнопке, нажав на &quot;⋮&quot;
            </p> */}
            <Button className="mt-2" onClick={downloadResult}>
              Скачать
            </Button>
          </div>
        )}
      </main>
      {/* <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center">
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="https://nextjs.org/icons/file.svg"
            alt="File icon"
            width={16}
            height={16}
          />
          Learn
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="https://nextjs.org/icons/window.svg"
            alt="Window icon"
            width={16}
            height={16}
          />
          Examples
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="https://nextjs.org/icons/globe.svg"
            alt="Globe icon"
            width={16}
            height={16}
          />
          Go to nextjs.org →
        </a>
      </footer> */}
    </div>
  );
}
