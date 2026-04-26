import { logger } from "./logger";
import type { Update } from "telegraf/types";
import { POSTGRES_URL } from "./env";
import { Pool } from "pg";

// --- PostgreSQL Implementation ---

let pool: Pool | null = null;

if (POSTGRES_URL) {
  pool = new Pool({
    connectionString: POSTGRES_URL,
    // Add some reasonable defaults for production-like self-hosting
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

/**
 * Initialize PostgreSQL tables if they don't exist.
 */
export const initPostgres = async () => {
  if (!pool) return;
  
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS updates (
        update_id BIGINT PRIMARY KEY,
        update_data JSONB,
        event_timestamp BIGINT
      );
      
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT,
        created_at BIGINT,
        payload JSONB
      );
      
      CREATE TABLE IF NOT EXISTS users (
        user_id BIGINT PRIMARY KEY,
        first_seen_at BIGINT,
        last_seen_at BIGINT,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        language_code TEXT
      );
      
      CREATE TABLE IF NOT EXISTS "telegraf-sessions" (
        key TEXT PRIMARY KEY,
        session JSONB
      );

      CREATE TABLE IF NOT EXISTS store (
        key TEXT PRIMARY KEY,
        value JSONB
      );
    `);
    logger.info("PostgreSQL tables initialized");
  } catch (error) {
    logger.error("Failed to initialize PostgreSQL tables:", error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Telegraf session store implementation for PostgreSQL
 */
const postgresSessionStore = {
  get: async (key: string) => {
    if (!pool) return null;
    const res = await pool.query('SELECT session FROM "telegraf-sessions" WHERE key = $1', [key]);
    return res.rows[0]?.session || null;
  },
  set: async (key: string, session: any) => {
    if (!pool) return;
    await pool.query(
      'INSERT INTO "telegraf-sessions" (key, session) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET session = $2',
      [key, session]
    );
  },
  delete: async (key: string) => {
    if (!pool) return;
    await pool.query('DELETE FROM "telegraf-sessions" WHERE key = $1', [key]);
  }
};

/**
 * Generic store implementation for PostgreSQL
 */
const postgresStore = {
  get: async (key: string) => {
    if (!pool) return null;
    const res = await pool.query('SELECT value FROM store WHERE key = $1', [key]);
    return res.rows[0]?.value || null;
  },
  set: async (key: string, value: any) => {
    if (!pool) return;
    await pool.query(
      'INSERT INTO store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      [key, value]
    );
  },
  delete: async (key: string) => {
    if (!pool) return;
    await pool.query('DELETE FROM store WHERE key = $1', [key]);
  }
};

// --- YDB Implementation (Commented Out) ---
/*
import { Driver, getCredentialsFromEnv, TypedValues } from "ydb-sdk";
export { TypedValues };
import { Ydb } from "telegraf-session-store-ydb";
import path from "path";
import { MOUNT_ROOT_DIR_PATH, YDB_DATABASE, YDB_ENDPOINT } from "./env";

process.env.YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS = path.resolve(
  MOUNT_ROOT_DIR_PATH,
  "./env/sakey.json"
);
export const driver = new Driver({
  endpoint: YDB_ENDPOINT,
  database: YDB_DATABASE,
  authService: getCredentialsFromEnv(),
  clientOptions: {
    operationTimeout: 30000,
  },
});

const createYdbStore = (options: any) => {
  try {
    return Ydb<any>(options);
  } catch (error) {
    logger.error("Failed to create YDB store:", error);
    return null;
  }
};

export const rawStore = createYdbStore({
  driver,
  driverOptions: { enableReadyCheck: true },
  tableOptions: {
    shouldCreateTable: false,
    tableName: "store",
    keyColumnName: "key",
    sessionColumnName: "value",
  },
});

export const rawSessionStore = createYdbStore({
  driver,
  driverOptions: { enableReadyCheck: true },
  tableOptions: {
    shouldCreateTable: false,
    tableName: "telegraf-sessions",
  },
});

const wrapWithRetry = (store: any) => {
  if (!store) return null;
  // ... (retry logic omitted for brevity in comments)
  return store;
};

export const ydbStore = rawStore ? wrapWithRetry(rawStore) : null;
export const ydbSessionStore = rawSessionStore ? wrapWithRetry(rawSessionStore) : null;

export const initUpdatesTableYDB = async () => {
  await driver.queryClient.do({
    fn: async (session) => {
      await session.execute({
        text: `
          CREATE TABLE IF NOT EXISTS updates (
            update_id Uint64,
            update_data Json,
            event_timestamp Uint64,
            PRIMARY KEY (update_id)
          );
          CREATE TABLE IF NOT EXISTS events (
            event_id Utf8,
            event_type Utf8,
            created_at Uint64,
            payload Json,
            PRIMARY KEY (event_id)
          );
        `,
      });
    },
  });
};
*/

// --- Multi-DB Export Layer ---

export const initUpdatesTable = async () => {
  if (POSTGRES_URL) {
    return initPostgres();
  }
  // else return initUpdatesTableYDB();
};

export const store = POSTGRES_URL ? postgresStore : null; // ydbStore
export const sessionStore = POSTGRES_URL ? postgresSessionStore : undefined;


 // ydbSessionStore

export const trackEvent = async (eventType: string, payload: Record<string, any>) => {
  if (POSTGRES_URL && pool) {
    try {
      const eventId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      const createdAt = Math.floor(Date.now() / 1000);
      await pool.query(
        'INSERT INTO events (event_id, event_type, created_at, payload) VALUES ($1, $2, $3, $4)',
        [eventId, eventType, createdAt, payload]
      );
    } catch (error) {
      logger.warn("track event error", error);
    }
    return;
  }
  // YDB trackEvent logic here...
};

export const trackUpdate = async (update: Update) => {
  if (POSTGRES_URL && pool) {
    try {
      const eventTimestamp = extractTimestamp(update);
      await pool.query(
        'INSERT INTO updates (update_id, update_data, event_timestamp) VALUES ($1, $2, $3) ON CONFLICT (update_id) DO NOTHING',
        [update.update_id, update, eventTimestamp]
      );
      await trackNewUser(update, eventTimestamp);
    } catch (error) {
      logger.warn("save update error", error);
    }
    return;
  }
  // YDB trackUpdate logic here...
};

export const getUserIdByUsername = async (username: string): Promise<number | null> => {
  const cleanUsername = username.startsWith("@") ? username.slice(1) : username;
  if (POSTGRES_URL && pool) {
    const res = await pool.query('SELECT user_id FROM users WHERE username = $1 LIMIT 1', [cleanUsername]);
    return res.rows[0] ? Number(res.rows[0].user_id) : null;
  }
  return null;
};

export interface SessionData {
  balance?: number;
  language?: string;
  translateLanguage?: string;
  preferEnhancedTranslate?: boolean;
  routers?: Record<string, unknown>;
  [key: string]: unknown;
}

export const getUserSession = async (userId: number): Promise<SessionData | null> => {
  const sessionKey = `${userId}:${userId}`;
  if (POSTGRES_URL && sessionStore) {
    return await sessionStore.get(sessionKey);
  }
  return null;
};

export const updateUserSessionBalance = async (userId: number, creditsToAdd: number): Promise<number> => {
  const sessionKey = `${userId}:${userId}`;
  let currentSession = await getUserSession(userId) || {};
  const newBalance = (currentSession.balance ?? 0) + creditsToAdd;
  currentSession.balance = newBalance;
  if (POSTGRES_URL && sessionStore) {
    await sessionStore.set(sessionKey, currentSession);
  }
  return newBalance;
};

const extractTimestamp = (update: Update): number => {
  if ("message" in update && update.message) return update.message.date;
  if ("edited_message" in update && update.edited_message) return update.edited_message.edit_date || update.edited_message.date;
  if ("callback_query" in update && update.callback_query?.message) return update.callback_query.message.date;
  if ("my_chat_member" in update && update.my_chat_member) return update.my_chat_member.date;
  return Math.floor(Date.now() / 1000);
};

const trackNewUser = async (update: Update, eventTimestamp: number) => {
  const userInfo = extractUserInfo(update);
  if (!userInfo || userInfo.isBot) return;
  if (POSTGRES_URL && pool) {
    try {
      await pool.query(
        `INSERT INTO users (user_id, first_seen_at, last_seen_at, username, first_name, last_name, language_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO NOTHING`,
        [
          userInfo.userId, 
          eventTimestamp, 
          eventTimestamp, 
          userInfo.username, 
          userInfo.firstName, 
          userInfo.lastName, 
          userInfo.languageCode
        ]
      );
    } catch (error) {
      logger.warn("track new user error", error);
    }
  }
};

const extractUserInfo = (update: Update) => {
  let from = (update as any).message?.from || 
             (update as any).callback_query?.from || 
             (update as any).inline_query?.from || 
             (update as any).my_chat_member?.from || 
             (update as any).edited_message?.from || 
             (update as any).chosen_inline_result?.from;
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

export const driver = null as any; // Mock for compatibility
export const TypedValues = null as any; // Mock for compatibility

// Export for testing
export const trackNewUserForTesting = trackNewUser;
