export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // where the app in running? how to start an app? (long polling / webhook)
      APP_ENV: "local" | "remote";
      // which environment variables to use to start the app?
      NODE_ENV: "development" | "production";
      // enable verbose debug information?
      DEBUG_ENV: "true" | undefined;
      DEBUG: string;
      EXECUTION_TIMEOUT: string;

      PROXY_SERVER_URI: string;

      OPENAI_API_BASE_URL: string;
      OPENAI_API_KEY: string;

      YDB_ENDPOINT: string;
      YDB_DATABASE: string;
      WORKER_BOT_SERVER_WEBHOOK_URL: string;
      WORKER_APP_SERVER_URL: string;

      YTDL_API_BASE_URL: string;
      YTDL_FUNCTION_URL: string;

      STORAGE_BUCKET: string;
      YTDL_STORAGE_BUCKET: string;

      // YC_IAM_TOKEN: string;
      YC_API_KEY: string;
      YC_FOLDER_ID: string;

      VIDEO_TRANSLATE_APP_URL: string;

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
      ALERTS_CHANNEL_ID: string;
      DEBUG_USER_CHAT_ID: string;
      ADMIN_IDS?: string;
      ADMIN_DASHBOARD_URL?: string;
    }
  }
}
