import * as dotenv from "dotenv";
dotenv.config();

export const PORT = process.env.PORT ?? 3000;

export const YANDEX_TRANSLATE_HMAC_SHA254_SECRET =
  process.env.YANDEX_TRANSLATE_HMAC_SHA254_SECRET;
