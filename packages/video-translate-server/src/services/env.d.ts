export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      BOT_TOKEN: string;

      YANDEX_TRANSLATE_HMAC_SHA254_SECRET: string;
    }
  }
}
