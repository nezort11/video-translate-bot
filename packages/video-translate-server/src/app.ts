import express, { Request } from "express";
import type { ErrorObject } from "serialize-error";
import cors from "cors";

import { VideoTranslateResponse, translateVideo } from "./services/vtrans";

// https://github.com/TypeStrong/ts-node/discussions/1290
const dynamicImport = new Function("specifier", "return import(specifier)") as <
  T,
>(
  module: string
) => Promise<T>;

export const app = express();

type VideoTranslateParams = {
  url: string;
};

app.use(cors());

app.post(
  "/translate",
  async (
    req: Request<
      {},
      VideoTranslateResponse | ErrorObject,
      null,
      VideoTranslateParams
    >,
    res
  ) => {
    try {
      const videoUrl = decodeURIComponent(req.query.url);
      console.log("videoUrl", videoUrl);

      // "https://www.youtube.com/watch?v=5bId3N7QZec"
      const translateResult = await translateVideo(videoUrl);
      res.json(translateResult);
    } catch (error) {
      const { serializeError } =
        await dynamicImport<typeof import("serialize-error")>(
          "serialize-error"
        );
      const serializedError = serializeError(error);
      // https://docs.pynt.io/documentation/api-security-testing/pynt-security-tests-coverage/stack-trace-in-response
      delete serializedError.stack;
      res.status(500).json(serializedError);
    }
  }
);
