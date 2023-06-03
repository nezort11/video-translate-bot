export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production";
      BOT_TOKEN_DEV: string;
      BOT_TOKEN_PROD: string;
      SENTRY_DSN: string;
      NOTIFICATION_BOT_TOKEN: string;
      NOTIFICATION_USER_ID: string;
      STORAGE_CHANNEL_ID: string;
      LOGGING_CHANNEL_ID: string;
      APP_ID: string;
      APP_HASH: string;
      SESSION: string;
    }
  }
}
