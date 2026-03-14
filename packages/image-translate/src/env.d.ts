export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CHROME_DOWNLOADS_DIR: string;
      PORT: string;
    }
  }
}
