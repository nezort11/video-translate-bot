import express, { Request } from "express";
import type { ErrorObject } from "serialize-error";
import cors from "cors";

import { VideoTranslateResponse, translateVideo } from "./vtrans";

// https://github.com/TypeStrong/ts-node/discussions/1290
const dynamicImport = new Function("specifier", "return import(specifier)") as <
  T,
>(
  module: string
) => Promise<T>;

export const app = express();
app.use(cors());
app.use(express.json());

app.post("/translate", async (req: Request, res) => {
  try {
    const {
      url,
      sourceLanguage,
      targetLanguage,
      videoFileUrl,
      subtitlesFileUrl,
      forceLively,
      firstRequest,
    } = req.body;

    console.log("Translating URL:", url);

    const translateResult = await translateVideo({
      url,
      sourceLanguage,
      targetLanguage,
      videoFileUrl,
      subtitlesFileUrl,
      useLivelyVoice: forceLively,
      firstRequest: firstRequest ?? true,
    });

    res.json(translateResult);
  } catch (error) {
    console.error("Translation error:", error);
    const { serializeError } =
      await dynamicImport<typeof import("serialize-error")>("serialize-error");
    const serializedError = serializeError(error);
    delete serializedError.stack;
    res.status(500).json(serializedError);
  }
});
