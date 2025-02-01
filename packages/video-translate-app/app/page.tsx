"use client"; // only skip SSR, left with SSG
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import logoImg from "./images/logo.jpg";

import axios from "axios";
import {
  FFmpeg,
  // CORE_VERSION,
  // MIME_TYPE_JAVASCRIPT,
  // MIME_TYPE_WASM,
  LogEventCallback,
  ProgressEventCallback,
  ERROR_TERMINATED,
} from "@ffmpeg/ffmpeg";
// import { fetchFile, toBlobURL } from "@ffmpeg/util";
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
import { useSearchParams } from "next/navigation";

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
  multithreading: z.boolean(),
  threads: z.coerce.number(),
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

class VideoTranslateError extends Error {
  constructor(...args: Parameters<typeof Error>) {
    super(...args);
    this.name = this.constructor.name;
  }
}

const VIDEO_TRANSLATE_ERROR =
  "Проблема при попытке переводе видео. Попробуй еще раз или немного позже. Информация об ошибке была передана";

export default function Home() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      link: decodeURIComponent(searchParams.get("url") ?? ""),
      multithreading: false,
      threads: 2,
    },
  });
  // 0% - indeterminate progress bar, other% - determinate
  const [translateProgress, setTranslateProgress] = useState<
    undefined | string | number
  >();
  const [resultFileUrl, setResultFileUrl] = useState<string | undefined>();
  const [translationCompleted, setTranslationCompleted] =
    useState<boolean>(false);

  const translateVideo = async (values: z.infer<typeof formSchema>) => {
    setTranslateProgress("Перевод аудио речи...");
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
        throw new VideoTranslateError();
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
    setTranslateProgress("Скачивание видео потока...");
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

    setTranslateProgress("Установка необходимых инструментов...");
    const ffmpeg = new FFmpeg();
    // let ffmpegProgress = 0;
    // if (!ffmpeg.isLoaded()) {
    if (!ffmpeg.loaded) {
      console.info("Loading ffmpeg...");

      // Utilize webpack assets modules to trigger bundle https://webpack.js.org/blog/2020-10-10-webpack-5-release/#asset-modules
      // - ONLY `umd` works (`esm` doesnt work for some reason)
      // - must be static (dont extract into variable! - limitation of webpack)
      // - must be relative path (adjust based on current file directory)
      const ffmpegCoreUrl = new URL(
        "../node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js",
        import.meta.url
      ).href;
      const ffmpegCoreWasmUrl = new URL(
        "../node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm",
        import.meta.url
      ).href;
      const ffmpegCoreMtUrl = new URL(
        "../node_modules/@ffmpeg/core-mt/dist/umd/ffmpeg-core.js",
        import.meta.url
      ).href;
      const ffmpegCoreMtWasmUrl = new URL(
        "../node_modules/@ffmpeg/core-mt/dist/umd/ffmpeg-core.wasm",
        import.meta.url
      ).href;
      const ffmpegCoreMtWorkerUrl = new URL(
        "../node_modules/@ffmpeg/core-mt/dist/umd/ffmpeg-core.worker.js",
        import.meta.url
      ).href;

      await ffmpeg.load({
        ...(values.multithreading
          ? {
              coreURL: ffmpegCoreMtUrl,
              wasmURL: ffmpegCoreMtWasmUrl,
              workerURL: ffmpegCoreMtWorkerUrl,
            }
          : {
              coreURL: ffmpegCoreUrl,
              wasmURL: ffmpegCoreWasmUrl,
            }),
      });
      console.info("FFmpeg loaded");
    }

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

    const ffmpegLogListener: LogEventCallback = ({ message }) => {
      console.log("ffmpeg message", message);
    };

    let ffmpegProgress: undefined | number = undefined;
    const ffmpegProgressListener: ProgressEventCallback = ({ progress }) => {
      console.log("ffmpeg progress", progress);
      ffmpegProgress = progress;
      setTranslateProgress(Math.round(progress * 100));
    };

    ffmpeg.on("log", ffmpegLogListener);
    ffmpeg.on("progress", ffmpegProgressListener);

    setTranslateProgress("Обработка видео...");

    const FFMPEG_HANG_TIMEOUT = 10000;
    setTimeout(() => {
      // If the ffmpeg.exec takes to long to start progress then probably has internal error inside
      if (ffmpegProgress === undefined) {
        ffmpeg.terminate(); // will trigger throw ERROR_TERMINATED from ffmpeg.exec
      }
    }, FFMPEG_HANG_TIMEOUT);

    console.log("Executing ffmpeg command...");
    // prettier-ignore
    await ffmpeg.exec([
      "-i", videoFilePath,
      "-i", translateAudioFilePath,

      "-filter_complex",
        `[0:a]volume=${percent(10)}[a];` + // 10% original playback
        `[1:a]volume=${percent(100)}[b];` + // voice over
        '[a][b]amix=inputs=2:dropout_transition=0', // :duration=longest',

      // may hang in chromium/safari (not firefox) https://github.com/ffmpegwasm/ffmpeg.wasm/issues/597#issuecomment-1994003272
      ...(values.multithreading ? ["-threads", `${values.threads}`] : []),

      // "-qscale:a", "9", // "4",
      // "-codec:a", "libmp3lame", // "aac",
      "-b:a", "64k", // decrease output size (MB) - default 128kb
      "-ac", "1", // decrease audio channel stereo to mono
      // " -pre", "ultrafast",

      resultFilePath,
    ]);
    console.log("Executed ffmpeg command");

    ffmpeg.off("log", ffmpegLogListener);
    ffmpeg.off("progress", ffmpegProgressListener);
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
      setTranslateProgress("Отправка переведенного видео...");
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

      setTranslationCompleted(true);
      // toast({
      //   title: "Переведенное видео было отправлено в чат с ботом",
      // });

      if (openTelegramLink.isAvailable()) {
        openTelegramLink("https://t.me/vidtransbot");
      }
    } else {
      setResultFileUrl(URL.createObjectURL(resultBlob));
    }
  };

  // 2. Define a submit handler.
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setResultFileUrl(undefined);
    try {
      await translateVideo(values);
      form.reset();
    } catch (error) {
      if (error instanceof VideoTranslateError) {
        form.setError("link", {
          message:
            "Не получается перевести данное видео, попробуйте в будущем или переведите другое видео",
        });
      } else if (error === ERROR_TERMINATED) {
        form.setError("threads", {
          message:
            "Ошибка при обработке видео (попробуйте уменьшить количество потоков)",
        });
      }
      // Generic error handler
      else {
        form.setError("root", { message: VIDEO_TRANSLATE_ERROR });
        setResultFileUrl(undefined);
        toast({
          title: "Оу упс! Что-то пошло не так.",
          description: VIDEO_TRANSLATE_ERROR,
          // title: "Uh oh! Something went wrong.",
          // description: "There was a problem with your request.",
        });

        console.error("translate error", error);
        // let error bubble to the top (handled by sentry)
        throw error;
      }
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
                    URL ссылка на видео, которое нужно перевести
                  </FormDescription>
                  {/* <FormMessage>{field.}</FormMessage> */}
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {/* Submit */}
              Перевести
            </Button>

            {translateProgress !== undefined && translateProgress !== 100 && (
              <div>
                <Progress
                  indeterminate={typeof translateProgress !== "number"}
                  value={
                    typeof translateProgress === "number"
                      ? translateProgress
                      : undefined
                  }
                  className="mt-4"
                />
                <p className="text-center">
                  {typeof translateProgress === "number"
                    ? `${translateProgress}%`
                    : translateProgress}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  *скорость перевода зависит от длины видео, а также от мощности
                  твоего девайса
                  <br />
                  *рекомендуется не прятать этот экран, чтобы перевод не
                  приостановился (iOS/Android)
                </p>
              </div>
            )}

            <FormMessage>{form.formState.errors.root?.message}</FormMessage>
            <div className="border p-4 rounded-md shadow space-y-4">
              <FormField
                control={form.control}
                name="multithreading"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 ">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={form.formState.isSubmitting}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Включить ускорение оброботки видео (экспереминтально)
                      </FormLabel>
                      <FormDescription>
                        Включает режим многопоточной обратоки, возможны ошибки
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="threads"
                disabled={form.formState.isSubmitting}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {/* Video Link */}
                      Количество потоков для обратоки
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        // placeholder="https://youtu.be/HeZf1QDpaOQ"
                        {...field}
                        disabled={
                          !form.watch("multithreading") ||
                          form.formState.isSubmitting
                        }
                      />
                    </FormControl>
                    <FormMessage>
                      {form.formState.errors.link?.message}
                    </FormMessage>
                    <FormDescription>
                      Количество потоков твоего устройста, которые будут
                      использоваться (учитывайте характеристикаки своего
                      устройста)
                    </FormDescription>
                    {/* <FormMessage>{field.}</FormMessage> */}
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>

        <Dialog
          open={translationCompleted}
          onOpenChange={setTranslationCompleted}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>✅ Перевод завершен</DialogTitle>
              <DialogDescription>
                Переведенное видео было отправленно в чат с ботом, можете
                закрывать данное приложения
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>

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
    </div>
  );
}
