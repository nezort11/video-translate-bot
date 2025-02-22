import dotenv from "dotenv";
import path from "path";
import { getChatId } from "./utils";

export const NODE_ENV = process.env.NODE_ENV;
console.log("NODE_ENV", NODE_ENV);
export const IS_PRODUCTION = process.env.NODE_ENV !== "development";

export let IS_PUBLIC = true;
export const setIsPublic = (isPublic: boolean) => (IS_PUBLIC = isPublic);

export const LAMBDA_TASK_ROOT = process.env.LAMBDA_TASK_ROOT;
// env directory path relative to package.json
// /function/storage from /function/code
export const MOUNT_ROOT_DIR_PATH = LAMBDA_TASK_ROOT ? "../storage/" : "./";
export const DOTENV_DIR_PATH = path.join(MOUNT_ROOT_DIR_PATH, "./env");
export const STORAGE_DIR_PATH = path.join(MOUNT_ROOT_DIR_PATH, "./storage");

// either load env file directly or
// otherwise loaded automatically by docker (.evn will not exist, checkout .dockerignore)
// if (process.env.ENV_FILE_LOADED !== "true") {
// /function/storage/env/.env
dotenv.config({ path: path.join(DOTENV_DIR_PATH, ".env") });

export const PORT = process.env.PORT ?? 3000;
export const EXECUTION_TIMEOUT = +(process.env.EXECUTION_TIMEOUT ?? 120);

export const APP_ENV = process.env.APP_ENV;
export const DEBUG_ENV = process.env.DEBUG_ENV;

// export const YC_IAM_TOKEN = process.env.YC_IAM_TOKEN;
export const YC_API_KEY = process.env.YC_API_KEY;
export const YC_FOLDER_ID = process.env.YC_FOLDER_ID;

// Dynamically loaded env variables
export const DEBUG = process.env.DEBUG!;
export const BOT_PUBLIC_USERNAME = process.env.BOT_PUBLIC_USERNAME!;
export const NOTIFICATION_BOT_TOKEN = process.env.NOTIFICATION_BOT_TOKEN!;
export const NOTIFICATION_USER_ID = process.env.NOTIFICATION_USER_ID!;

export const YDB_ENDPOINT = process.env.YDB_ENDPOINT;
export const YDB_DATABASE = process.env.YDB_DATABASE;
export const STORAGE_BUCKET = process.env.STORAGE_BUCKET;
export const YTDL_STORAGE_BUCKET = process.env.YTDL_STORAGE_BUCKET;
export const WORKER_BOT_SERVER_WEBHOOK_URL =
  process.env.WORKER_BOT_SERVER_WEBHOOK_URL;

export const VIDEO_TRANSLATE_APP_URL = process.env.VIDEO_TRANSLATE_APP_URL;

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
