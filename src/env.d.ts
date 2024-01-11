export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production";
      DEBUG: string;
      BOT_TOKEN_DEV: string;
      BOT_TOKEN_PROD: string;
      BOT_PUBLIC_USERNAME: string;
      CONTACT_USERNAME: string;
      STORAGE_CHANNEL_ID: string;
      APP_ID: string;
      APP_HASH: string;
      SESSION: string;

      SENTRY_DSN: string;
      NOTIFICATION_BOT_TOKEN: string;
      NOTIFICATION_USER_ID: string;
      LOGGING_CHANNEL_ID: string;
      DEBUG_USER_CHAT_ID: string;
    }
  }
}
