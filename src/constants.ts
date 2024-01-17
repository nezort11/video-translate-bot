import { getChatId } from "./utils";

export const NODE_ENV = process.env.NODE_ENV;
export const IS_PRODUCTION = process.env.NODE_ENV !== "development";

export let IS_PUBLIC = true;
export const setIsPublic = (isPublic: boolean) => (IS_PUBLIC = isPublic);

// otherwise loaded automatically by docker
if (!IS_PRODUCTION) {
  const dotenv = await import("dotenv");
  dotenv.config({ path: "./.env" }); // mutates process.env from .env
}

// Dynamically loaded env variables
export const DEBUG = process.env.DEBUG!;
export const BOT_PUBLIC_USERNAME = process.env.BOT_PUBLIC_USERNAME!;
export const NOTIFICATION_BOT_TOKEN = process.env.NOTIFICATION_BOT_TOKEN!;
export const NOTIFICATION_USER_ID = process.env.NOTIFICATION_USER_ID!;

export const STORAGE_CHANNEL_ID = process.env.STORAGE_CHANNEL_ID!;
export const STORAGE_CHANNEL_CHAT_ID = getChatId(STORAGE_CHANNEL_ID);

export const BOT_TOKEN = (
  IS_PRODUCTION ? process.env.BOT_TOKEN_PROD : process.env.BOT_TOKEN_DEV
)!;

export const CONTACT_USERNAME = process.env.CONTACT_USERNAME!;

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
