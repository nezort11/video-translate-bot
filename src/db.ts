import { Driver, getCredentialsFromEnv, TypedValues } from "ydb-sdk";
import { Ydb } from "telegraf-session-store-ydb";
import path from "path";
import { MOUNT_ROOT_DIR_PATH, YDB_DATABASE, YDB_ENDPOINT } from "./env";
import { logger } from "./logger";
import type { Update } from "telegraf/types";

// YDB compatible with AWS DynamoDB
// https://yandex.cloud/ru/docs/ydb/concepts/dynamodb-tables
// https://yandex.cloud/ru/docs/ydb/docapi/tools/aws-sdk/

process.env.YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS = path.resolve(
  MOUNT_ROOT_DIR_PATH,
  "./env/sakey.json"
);
export const driver = new Driver({
  // connectionString does not work for some reason
  // connectionString: "",
  endpoint: YDB_ENDPOINT,
  database: YDB_DATABASE,
  authService: getCredentialsFromEnv(),
  // Increased operation timeout, helps during high database load or network latency (Timeout code 400090)
  clientOptions: {
    operationTimeout: 30000,
  },
});

// Generic Redis-like store-table in YDB
export const store = Ydb<any>({
  driver,
  driverOptions: { enableReadyCheck: true },
  tableOptions: {
    shouldCreateTable: true,
    tableName: "store",
    keyColumnName: "key",
    sessionColumnName: "value",
  },
});

export const sessionStore = Ydb<any>({
  driver,
  driverOptions: { enableReadyCheck: true },
  tableOptions: {
    shouldCreateTable: true,
    tableName: "telegraf-sessions",
  },
});

const initUpdatesTable = async () => {
  await driver.queryClient.do({
    fn: async (session) => {
      await session.execute({
        text: `
          CREATE TABLE IF NOT EXISTS updates (
            update_id Uint64,
            update_data Json,
            PRIMARY KEY (update_id)
          );
        `,
      });
    },
  });
};

/**
 * Extract timestamp from Telegram update object
 */
const extractTimestamp = (update: Update): number => {
  if ("message" in update && update.message) {
    return update.message.date;
  }
  if ("edited_message" in update && update.edited_message) {
    return update.edited_message.edit_date || update.edited_message.date;
  }
  if ("callback_query" in update && update.callback_query?.message) {
    return update.callback_query.message.date;
  }
  if ("inline_query" in update && update.inline_query) {
    // Inline queries don't have date, use current time
    return Math.floor(Date.now() / 1000);
  }
  if ("my_chat_member" in update && update.my_chat_member) {
    return update.my_chat_member.date;
  }
  // Fallback to current time
  return Math.floor(Date.now() / 1000);
};

/**
 * User info extracted from Telegram update
 */
interface UserInfo {
  userId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  isBot: boolean;
}

/**
 * Extract user info from Telegram update object
 */
const extractUserInfo = (update: Update): UserInfo | null => {
  let from:
    | {
        id: number;
        is_bot: boolean;
        username?: string;
        first_name?: string;
        last_name?: string;
        language_code?: string;
      }
    | undefined;

  if ("message" in update && update.message?.from) {
    from = update.message.from;
  } else if ("callback_query" in update && update.callback_query?.from) {
    from = update.callback_query.from;
  } else if ("inline_query" in update && update.inline_query?.from) {
    from = update.inline_query.from;
  } else if ("my_chat_member" in update && update.my_chat_member?.from) {
    from = update.my_chat_member.from;
  } else if ("edited_message" in update && update.edited_message?.from) {
    from = update.edited_message.from;
  } else if (
    "chosen_inline_result" in update &&
    update.chosen_inline_result?.from
  ) {
    from = update.chosen_inline_result.from;
  }

  if (!from) return null;

  return {
    userId: from.id,
    username: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
    languageCode: from.language_code,
    isBot: from.is_bot,
  };
};

export const trackUpdate = async (update: Update) => {
  try {
    // Table is pre-provisioned; avoid schema operations on hot path
    // await initUpdatesTable();
    logger.info("Table 'updates' is ready");

    const eventTimestamp = extractTimestamp(update);

    await driver.tableClient.withSessionRetry(async (session) => {
      await session.executeQuery(
        `DECLARE $update_id AS Uint64;
       DECLARE $update_data AS Json;
       DECLARE $event_timestamp AS Uint64;
       UPSERT INTO updates (update_id, update_data, event_timestamp)
       VALUES ($update_id, $update_data, $event_timestamp);`,
        {
          $update_id: TypedValues.uint64(update.update_id),
          $update_data: TypedValues.json(JSON.stringify(update)),
          $event_timestamp: TypedValues.uint64(eventTimestamp),
        }
      );
      logger.info("Inserted update with ID:", update.update_id);
    });

    // Also track new users (insert only, don't update existing)
    await trackNewUser(update, eventTimestamp);
  } catch (error) {
    logger.warn("save update error", error);
  }
};

/**
 * Insert a new user into the users table (only if they don't exist yet).
 * This keeps the users table up-to-date for "Total Users" count.
 * Existing users are NOT updated (to preserve original message counts from migration).
 */
const trackNewUser = async (update: Update, eventTimestamp: number) => {
  try {
    const userInfo = extractUserInfo(update);

    // Skip if no user info or if it's a bot
    if (!userInfo || userInfo.isBot) {
      return;
    }

    await driver.tableClient.withSessionRetry(async (session) => {
      // Use INSERT with NOT EXISTS check - only insert if user doesn't exist
      // This ensures existing users are never updated
      // Note: YQL requires a FROM clause for WHERE filtering, so we use AS_TABLE
      // to create a single-row virtual table from our parameters
      await session.executeQuery(
        `DECLARE $user_id AS Uint64;
         DECLARE $first_seen_at AS Uint64;
         DECLARE $last_seen_at AS Uint64;
         DECLARE $username AS Utf8;
         DECLARE $first_name AS Utf8;
         DECLARE $last_name AS Utf8;
         DECLARE $language_code AS Utf8;

         -- Only insert if user doesn't already exist
         -- Use LEFT JOIN to filter out existing users
         INSERT INTO users (user_id, first_seen_at, last_seen_at, username, first_name, last_name, language_code)
         SELECT
           t.user_id,
           t.first_seen_at,
           t.last_seen_at,
           IF(t.username = "", NULL, t.username),
           IF(t.first_name = "", NULL, t.first_name),
           IF(t.last_name = "", NULL, t.last_name),
           IF(t.language_code = "", NULL, t.language_code)
         FROM AS_TABLE(AsList(AsStruct(
           $user_id AS user_id,
           $first_seen_at AS first_seen_at,
           $last_seen_at AS last_seen_at,
           $username AS username,
           $first_name AS first_name,
           $last_name AS last_name,
           $language_code AS language_code
         ))) AS t
         LEFT JOIN users ON users.user_id = t.user_id
         WHERE users.user_id IS NULL;`,
        {
          $user_id: TypedValues.uint64(userInfo.userId),
          $first_seen_at: TypedValues.uint64(eventTimestamp),
          $last_seen_at: TypedValues.uint64(eventTimestamp),
          $username: TypedValues.utf8(userInfo.username || ""),
          $first_name: TypedValues.utf8(userInfo.firstName || ""),
          $last_name: TypedValues.utf8(userInfo.lastName || ""),
          $language_code: TypedValues.utf8(userInfo.languageCode || ""),
        }
      );
    });
  } catch (error) {
    // Don't fail the main update tracking if user tracking fails
    logger.warn("track new user error (non-fatal):", error);
  }
};

/**
 * Track a new user - exported for testing purposes
 * @internal
 */
export const trackNewUserForTesting = trackNewUser;

/**
 * Find user ID by username from the users table.
 * @param username - Telegram username (with or without @)
 * @returns user_id if found, null otherwise
 */
export const getUserIdByUsername = async (
  username: string
): Promise<number | null> => {
  // Remove @ prefix if present
  const cleanUsername = username.startsWith("@") ? username.slice(1) : username;

  let userId: number | null = null;

  await driver.tableClient.withSessionRetry(async (session) => {
    const result = await session.executeQuery(
      `DECLARE $username AS Utf8;
       SELECT user_id FROM users WHERE username = $username LIMIT 1;`,
      {
        $username: TypedValues.utf8(cleanUsername),
      }
    );

    const row = result.resultSets[0]?.rows?.[0];
    if (row) {
      // user_id is stored as Uint64
      userId = Number(row.items?.[0]?.uint64Value ?? 0);
    }
  });

  return userId;
};

/**
 * Session data structure stored in telegraf-sessions table
 */
export interface SessionData {
  balance?: number;
  language?: string;
  translateLanguage?: string;
  preferEnhancedTranslate?: boolean;
  routers?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Get user session from the telegraf-sessions table.
 * Session key format: "${userId}:${userId}" for private chats.
 * @param userId - Telegram user ID
 * @returns session data if found, null otherwise
 */
export const getUserSession = async (
  userId: number
): Promise<SessionData | null> => {
  // In Telegraf, the default session key for private chats is `${chatId}:${chatId}`
  // For private chats, chatId equals userId
  const sessionKey = `${userId}:${userId}`;

  let sessionData: SessionData | null = null;

  await driver.tableClient.withSessionRetry(async (session) => {
    const result = await session.executeQuery(
      `DECLARE $key AS Utf8;
       SELECT session FROM \`telegraf-sessions\` WHERE key = $key LIMIT 1;`,
      {
        $key: TypedValues.utf8(sessionKey),
      }
    );

    const row = result.resultSets[0]?.rows?.[0];
    if (row) {
      const jsonValue = row.items?.[0]?.textValue;
      if (jsonValue) {
        try {
          sessionData = JSON.parse(jsonValue);
        } catch {
          logger.warn("Failed to parse session JSON for user:", userId);
        }
      }
    }
  });

  return sessionData;
};

/**
 * Update user session balance by adding credits.
 * Creates a new session if one doesn't exist.
 * @param userId - Telegram user ID
 * @param creditsToAdd - Number of credits to add (can be negative to subtract)
 * @returns The new balance after update
 */
export const updateUserSessionBalance = async (
  userId: number,
  creditsToAdd: number
): Promise<number> => {
  const sessionKey = `${userId}:${userId}`;

  // Get current session or create empty one
  let currentSession = await getUserSession(userId);
  if (!currentSession) {
    currentSession = {};
  }

  // Calculate new balance
  const currentBalance = currentSession.balance ?? 0;
  const newBalance = currentBalance + creditsToAdd;
  currentSession.balance = newBalance;

  // Save updated session
  await driver.tableClient.withSessionRetry(async (session) => {
    await session.executeQuery(
      `DECLARE $key AS Utf8;
       DECLARE $session AS Json;
       UPSERT INTO \`telegraf-sessions\` (key, session)
       VALUES ($key, $session);`,
      {
        $key: TypedValues.utf8(sessionKey),
        $session: TypedValues.json(JSON.stringify(currentSession)),
      }
    );
  });

  return newBalance;
};
