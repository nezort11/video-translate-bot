import express, { Request } from "express";

import { translateImage } from "./translateimage";

// https://github.com/TypeStrong/ts-node/discussions/1290
const dynamicImport = new Function("specifier", "return import(specifier)");

const app = express();

app.use(express.json());

interface ImageTranslateRequest {
  imageLink: string;
}

app.post(
  "/translate",
  async (req: Request<{}, {}, ImageTranslateRequest>, res, next) => {
    try {
      const imageLink = req.body.imageLink;
      console.log("imageLink:", imageLink);

      const translatedImage = await translateImage(imageLink);
      res.set("Content-Type", "image/jpeg");
      res.send(translatedImage);
    } catch (error) {
      console.warn(error);
      if (error instanceof Error) {
        error.name = error.constructor.name;
      }

      const { serializeError } = await dynamicImport("serialize-error");
      res
        .status(500)
        .setHeader("Content-Type", "application/json")
        .send({ error: serializeError(error) });
    }
  }
);

if (require.main === module) {
  const PORT = process.env.PORT ?? 3000;

  app.listen(PORT, () => {
    console.log(`Image translate service listening at port ${PORT}`);
  });
}
