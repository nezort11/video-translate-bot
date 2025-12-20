import dotenv from "dotenv";
import path from "path";

// Load .env file from the package directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE_ENV === "production";

// Yandex Cloud Function paths
export const LAMBDA_TASK_ROOT = process.env.LAMBDA_TASK_ROOT;
export const ROOT_DIR_PATH = path.resolve(__dirname, "..");

// Mount paths for YCF
export const MOUNT_ROOT_DIR_PATH = path.resolve(
  ROOT_DIR_PATH,
  LAMBDA_TASK_ROOT ? "../storage" : "../.."
);
export const DOTENV_DIR_PATH = path.resolve(MOUNT_ROOT_DIR_PATH, "env");

// Load env from mounted bucket in production
if (LAMBDA_TASK_ROOT) {
  dotenv.config({ path: path.join(DOTENV_DIR_PATH, ".env") });
}

// Server config
export const PORT = process.env.PORT ?? 3001;

// Auth config
export const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
export const DEBUG_ADMIN_ID = process.env.DEBUG_ADMIN_ID || parseInt(ADMIN_IDS[0]) || 123456789;
export const BOT_TOKEN = process.env.BOT_TOKEN || "";
export const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
export const JWT_EXPIRES_IN = "24h";

// YDB config
export const YDB_ENDPOINT = process.env.YDB_ENDPOINT;
export const YDB_DATABASE = process.env.YDB_DATABASE;

// Service account key path
export const YDB_SERVICE_ACCOUNT_KEY_PATH = path.resolve(
  DOTENV_DIR_PATH,
  "sakey.json"
);

console.log("[admin-api] NODE_ENV:", NODE_ENV);
console.log("[admin-api] ADMIN_IDS:", ADMIN_IDS);
console.log("[admin-api] YDB_ENDPOINT:", YDB_ENDPOINT);
console.log("[admin-api] YDB_DATABASE:", YDB_DATABASE);console.log("[admin-api] YDB_SERVICE_ACCOUNT_KEY_PATH:", YDB_SERVICE_ACCOUNT_KEY_PATH);
