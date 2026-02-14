import dotenv from "dotenv";
import path from "path";
import fs from "fs";

export const LAMBDA_TASK_ROOT = process.env.LAMBDA_TASK_ROOT;

export const ROOT_DIR_PATH = path.resolve(__dirname, "..");
export const MOUNT_ROOT_DIR_PATH = path.resolve(
  ROOT_DIR_PATH,
  LAMBDA_TASK_ROOT ? "../storage" : "."
);
export const DOTENV_DIR_PATH = path.resolve(MOUNT_ROOT_DIR_PATH, "env");

console.log("Loading environment from", DOTENV_DIR_PATH);
if (fs.existsSync(path.join(DOTENV_DIR_PATH, ".env"))) {
  dotenv.config({ path: path.join(DOTENV_DIR_PATH, ".env") });
} else {
  console.warn("No .env file found at", DOTENV_DIR_PATH);
}

export const YANDEX_TRANSLATE_HMAC_SHA254_SECRET =
  process.env.YANDEX_TRANSLATE_HMAC_SHA254_SECRET;

if (!YANDEX_TRANSLATE_HMAC_SHA254_SECRET) {
  throw new Error("YANDEX_TRANSLATE_HMAC_SHA254_SECRET is not defined");
}
