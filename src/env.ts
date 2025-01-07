import dotenv from "dotenv";
import { getChatId } from "./utils";

export const NODE_ENV = process.env.NODE_ENV;
console.log("NODE_ENV", NODE_ENV);
export const IS_PRODUCTION = process.env.NODE_ENV !== "development";

export let IS_PUBLIC = true;
export const setIsPublic = (isPublic: boolean) => (IS_PUBLIC = isPublic);

// either load env file directly or
// otherwise loaded automatically by docker (.evn will not exist, checkout .dockerignore)
// if (process.env.ENV_FILE_LOADED !== "true") {
dotenv.config({ path: "./env/.env" }); // mutates process.env from .env if exists
// }

export const PORT = process.env.PORT ?? 3000;
export const EXECUTION_TIMEOUT = +process.env.EXECUTION_TIMEOUT;

export const APP_ENV = process.env.APP_ENV;

// Dynamically loaded env variables
export const DEBUG = process.env.DEBUG!;
export const BOT_PUBLIC_USERNAME = process.env.BOT_PUBLIC_USERNAME!;
export const NOTIFICATION_BOT_TOKEN = process.env.NOTIFICATION_BOT_TOKEN!;
export const NOTIFICATION_USER_ID = process.env.NOTIFICATION_USER_ID!;

export const STORAGE_BUCKET = process.env.STORAGE_BUCKET;

export const VIDEO_TRANSLATE_API_URL = process.env.VIDEO_TRANSLATE_API_URL;
export const YTDL_API_URL = process.env.YTDL_API_URL;

export const YANDEX_TRANSLATE_HMAC_SHA254_SECRET =
  process.env.YANDEX_TRANSLATE_HMAC_SHA254_SECRET!;

export const STORAGE_CHANNEL_ID = process.env.STORAGE_CHANNEL_ID!;
export const STORAGE_CHANNEL_CHAT_ID = getChatId(STORAGE_CHANNEL_ID);

export const BOT_TOKEN = (
  IS_PRODUCTION ? process.env.BOT_TOKEN_PROD : process.env.BOT_TOKEN_DEV
)!;

export const OWNER_USERNAME = process.env.OWNER_USERNAME!;

export const SENTRY_DSN = process.env.SENTRY_DSN!;

const LOGGING_CHANNEL_ID = process.env.LOGGING_CHANNEL_ID!;
export const LOGGING_CHANNEL_CHAT_ID = getChatId(LOGGING_CHANNEL_ID);

export const API_ID = process.env.APP_ID!;
export const APP_HASH = process.env.APP_HASH!;
export const SESSION = (
  IS_PRODUCTION ? process.env.SESSION_PROD : process.env.SESSION_DEV
)!;

export const IMAGE_TRANSLATE_URL = process.env.IMAGE_TRANSLATE_URL!;

export const DEBUG_USER_CHAT_ID = process.env.DEBUG_USER_CHAT_ID!;
