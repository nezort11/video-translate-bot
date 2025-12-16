import crypto from "crypto";
import { BOT_TOKEN, ADMIN_IDS } from "../env";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export interface InitDataPayload {
  query_id?: string;
  user?: TelegramUser;
  auth_date: number;
  hash: string;
  [key: string]: any;
}

/**
 * Parse initData string into an object
 */
export const parseInitData = (initData: string): InitDataPayload => {
  const params = new URLSearchParams(initData);
  const data: Record<string, any> = {};

  for (const [key, value] of params) {
    if (key === "user") {
      try {
        data[key] = JSON.parse(value);
      } catch {
        data[key] = value;
      }
    } else if (key === "auth_date") {
      data[key] = parseInt(value, 10);
    } else {
      data[key] = value;
    }
  }

  return data as InitDataPayload;
};

/**
 * Verify Telegram initData signature
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export const verifyInitData = (
  initData: string,
  botToken: string = BOT_TOKEN
): { valid: boolean; error?: string; data?: InitDataPayload } => {
  if (!botToken) {
    return { valid: false, error: "BOT_TOKEN not configured" };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) {
      return { valid: false, error: "Missing hash in initData" };
    }

    // Remove hash from params and sort alphabetically
    params.delete("hash");
    const dataCheckArray: string[] = [];
    const sortedKeys = Array.from(params.keys()).sort();

    for (const key of sortedKeys) {
      dataCheckArray.push(`${key}=${params.get(key)}`);
    }

    const dataCheckString = dataCheckArray.join("\n");

    // Create secret key: HMAC-SHA256(bot_token, "WebAppData")
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    // Calculate HMAC-SHA256 of data_check_string
    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (calculatedHash !== hash) {
      return { valid: false, error: "Invalid hash signature" };
    }

    // Parse and verify auth_date (should be within 120 seconds for fresh data)
    const parsed = parseInitData(initData);
    const authDate = parsed.auth_date;
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 120; // 2 minutes

    if (now - authDate > maxAge) {
      // For Mini Apps, we allow older auth_date since it's set at app open
      // Just log a warning but don't fail
      console.warn(
        `[telegram] initData auth_date is ${
          now - authDate
        }s old (max ${maxAge}s)`
      );
    }

    return { valid: true, data: parsed };
  } catch (error) {
    console.error("[telegram] Error verifying initData:", error);
    return { valid: false, error: "Failed to verify initData" };
  }
};

/**
 * Check if user ID is in the admin whitelist
 */
export const isAdmin = (userId: number): boolean => {
  return ADMIN_IDS.includes(String(userId));
};
