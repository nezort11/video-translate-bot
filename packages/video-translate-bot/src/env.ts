import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { getChatId } from "./chatid";
import axios from "axios";
import https from "https";
import { logger } from "./logger";

if (!process.env.APP_ENV) {
  throw new Error(
    "APP_ENV is not defined. Please explicitly set APP_ENV to 'local' or 'production'."
  );
}

export const APP_ENV = process.env.APP_ENV;
export const IS_PRODUCTION = APP_ENV === "production";

export let IS_PUBLIC = true;
export const setIsPublic = (isPublic: boolean) => (IS_PUBLIC = isPublic);

export const LAMBDA_TASK_ROOT = process.env.LAMBDA_TASK_ROOT;
// console.log("LAMBDA_TASK_ROOT", LAMBDA_TASK_ROOT);
// env directory path relative to package.json

// Yandex Cloud Function fs:
// /function/code - root
// /function/storage/env - env bucket
// /function/storage/storage - storage bucket

// Docker fs:
// /app - root
// /app/build - app code
// /app/env - env bucket
// /app/storage - storage bucket

export const ROOT_DIR_PATH = path.resolve(__dirname, "..");

// export const MOUNT_ROOT_DIR_PATH = LAMBDA_TASK_ROOT ? "../storage/" : "./";
export const MOUNT_ROOT_DIR_PATH = path.resolve(
  ROOT_DIR_PATH,
  LAMBDA_TASK_ROOT ? "../storage" : "."
);
// export const DOTENV_DIR_PATH = path.join(MOUNT_ROOT_DIR_PATH, "./env");
// console.log("MOUNT_ROOT_DIR_PATH", MOUNT_ROOT_DIR_PATH);
export const DOTENV_DIR_PATH = path.resolve(MOUNT_ROOT_DIR_PATH, "env");
// console.log("DOTENV_DIR_PATH", DOTENV_DIR_PATH);
export const STORAGE_DIR_PATH = path.join(MOUNT_ROOT_DIR_PATH, "./storage");

// console.log("logging all files in env directory...", DOTENV_DIR_PATH);
const files = fs.readdirSync(DOTENV_DIR_PATH);
// files.forEach((file) => {
//   console.log("dotenv dir file", file);
// });

// const GOOGLE_APPLICATION_CREDENTIALS_PATH = path.join(
//   DOTENV_DIR_PATH,
//   "gcp-universal-sa.json"
// );
const GOOGLE_APPLICATION_CREDENTIALS_PATH = path.resolve(
  DOTENV_DIR_PATH,
  "gcp-universal-sa.json"
);
// "/app/env/gcp-universal-sa.json";
process.env.GOOGLE_APPLICATION_CREDENTIALS =
  GOOGLE_APPLICATION_CREDENTIALS_PATH;

// either load env file directly or
// otherwise loaded automatically by docker (.evn will not exist, checkout .dockerignore)
// if (process.env.ENV_FILE_LOADED !== "true") {
// /function/storage/env/.env
dotenv.config({ path: path.join(DOTENV_DIR_PATH, ".env") });

export const PORT = process.env.PORT ?? 3000;
export const EXECUTION_TIMEOUT = +(process.env.EXECUTION_TIMEOUT ?? 120);
export const MAX_VIDEO_DURATION_MINUTES = +(
  process.env.MAX_VIDEO_DURATION_MINUTES ?? 70
);

export const DEBUG_ENV = process.env.DEBUG_ENV;

export const PROXY_SERVER_URI = process.env.PROXY_SERVER_URI;
export const PROXY_SERVER_URIS = (process.env.PROXY_SERVER_URIS ?? "")
  .split(",")
  .map((uri) => uri.trim())
  .filter(Boolean);

// If both are provided, merge them
export const ALL_PROXY_URIS = Array.from(
  new Set([
    ...(PROXY_SERVER_URI ? [PROXY_SERVER_URI] : []),
    ...PROXY_SERVER_URIS,
  ])
);

export const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
export const WORKER_APP_SERVER_URL =
  APP_ENV === "local" && process.env.USE_LOCAL_WORKER === "true"
    ? `http://127.0.0.1:${process.env.PORT ?? 3000}/`
    : process.env.WORKER_APP_SERVER_URL;
export const TELEGRAM_SERVICE_URL = process.env.TELEGRAM_SERVICE_URL;

export const VIDEO_TRANSLATE_APP_URL = process.env.VIDEO_TRANSLATE_APP_URL;
export const VTRANS_SERVICE_URL = process.env.VTRANS_SERVICE_URL;

export const YTDL_API_BASE_URL = process.env.YTDL_API_BASE_URL;

export const YANDEX_TRANSLATE_HMAC_SHA254_SECRET =
  process.env.YANDEX_TRANSLATE_HMAC_SHA254_SECRET!;

export const STORAGE_CHANNEL_ID = process.env.STORAGE_CHANNEL_ID!;
export const STORAGE_CHANNEL_CHAT_ID = getChatId(STORAGE_CHANNEL_ID);

export const BOT_TOKEN_PROD = process.env.BOT_TOKEN_PROD!;
export const BOT_TOKEN_DEV = process.env.BOT_TOKEN_DEV!;

export const BOT_TOKEN = (IS_PRODUCTION ? BOT_TOKEN_PROD : BOT_TOKEN_DEV)!;

export const OWNER_USERNAME = process.env.OWNER_USERNAME!;

export const ADMIN_IDS = (process.env.ADMIN_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export const ADMIN_DASHBOARD_URL = process.env.ADMIN_DASHBOARD_URL;

const LOGGING_CHANNEL_ID = process.env.LOGGING_CHANNEL_ID;
export const LOGGING_CHANNEL_CHAT_ID = getChatId(LOGGING_CHANNEL_ID);
const REPORT_CHANNEL_ID =
  process.env.REPORT_CHANNEL_ID || process.env.LOGGING_CHANNEL_ID;
export const REPORT_CHANNEL_CHAT_ID = getChatId(REPORT_CHANNEL_ID);
const ALERTS_CHANNEL_ID = process.env.ALERTS_CHANNEL_ID;
export const ALERTS_CHANNEL_CHAT_ID = getChatId(ALERTS_CHANNEL_ID);

export const API_ID = process.env.APP_ID!;
export const APP_HASH = process.env.APP_HASH!;

export const DEBUG_USER_CHAT_ID = process.env.DEBUG_USER_CHAT_ID!;

export const YTDL_FUNCTION_URL = process.env.YTDL_FUNCTION_URL;

export const EHP_PROXY = process.env.EHP_PROXY;

/*
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";

let proxyRotationIndex = 0;
const cachedAgents = new Map<string, any>();

export const getProxyAgent = (forceRotate = false, uri?: string) => {
  if (!uri && ALL_PROXY_URIS.length === 0) return null;

  if (forceRotate && !uri) {
    proxyRotationIndex = (proxyRotationIndex + 1) % ALL_PROXY_URIS.length;
  }

  const proxyUri = uri || ALL_PROXY_URIS[proxyRotationIndex];
  if (!proxyUri) return null;

  if (cachedAgents.has(proxyUri)) return cachedAgents.get(proxyUri);

  let agent: any = null;
  if (proxyUri.startsWith("socks")) {
    const socksUri = proxyUri.replace("socks5://", "socks5h://");
    agent = new SocksProxyAgent(socksUri);
  } else if (
    proxyUri.startsWith("http://") ||
    proxyUri.startsWith("https://")
  ) {
    agent = new HttpsProxyAgent(proxyUri);
  }

  if (agent) {
    cachedAgents.set(proxyUri, agent);
  }

  return agent;
};

/ **
 * Searches for a working proxy from the available list by testing them.
 * @returns A working proxy agent or null
 * /
export const getWorkingProxyAgent = async () => {
  if (ALL_PROXY_URIS.length === 0) return null;

  logger.info(`🔍 Testing ${ALL_PROXY_URIS.length} proxies in parallel...`);

  const testProxy = async (uri: string) => {
    try {
      const agent = getProxyAgent(false, uri);
      if (!agent) return null;

      const testStart = Date.now();
      // Use direct https.get to avoid axios-specific agent handling issues
      await new Promise((resolve, reject) => {
        const req = https.get("https://api.telegram.org", {
          agent,
          timeout: 15000,
        }, (res) => {
          resolve(res);
        });
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Timeout (15s)"));
        });
      });

      logger.info(
        `✅ Working proxy found: ${uri} (ping: ${Date.now() - testStart}ms)`
      );
      return { uri, agent };
    } catch (error: any) {
      logger.warn(`❌ Proxy failed: ${uri} - ${error.message}`);
      if (error.stack) {
        // Only log stack in local env for debugging
        if (APP_ENV === "local") logger.debug(error.stack);
      }
      return null;
    }
  };

  const results = await Promise.all(ALL_PROXY_URIS.map(testProxy));
  const working = results.find((r) => r !== null);

  if (working) {
    proxyRotationIndex = ALL_PROXY_URIS.indexOf(working.uri);
    return working.agent;
  }

  logger.error("🚫 No working proxies found in the list.");
  return null;
};
*/
export const getProxyAgent = (...args: any[]) => null as any;
export const getWorkingProxyAgent = async (...args: any[]) => null as any;
