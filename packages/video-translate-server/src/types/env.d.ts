export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: string | undefined;

      NODE_ENV: "development" | "production";
      YANDEX_TRANSLATE_HMAC_SHA254_SECRET: string;
    }
  }
}
