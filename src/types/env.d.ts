export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production";
      DEBUG: string;
      EXECUTION_TIMEOUT: string;

      STORAGE_BUCKET: string;

      VIDEO_TRANSLATE_API_URL: string;
      YTDL_API_URL: string;

      BOT_TOKEN_DEV: string;
      BOT_TOKEN_PROD: string;
      BOT_PUBLIC_USERNAME: string;
      YANDEX_TRANSLATE_HMAC_SHA254_SECRET: string;
      OWNER_USERNAME: string;
      STORAGE_CHANNEL_ID: string;
      APP_ID: string;
      APP_HASH: string;
      SESSION_DEV: string;
      SESSION_PROD: string;

      SENTRY_DSN: string;
      NOTIFICATION_BOT_TOKEN: string;
      NOTIFICATION_USER_ID: string;
      LOGGING_CHANNEL_ID: string;
      DEBUG_USER_CHAT_ID: string;
    }
  }
}
