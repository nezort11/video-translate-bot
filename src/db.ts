import { Driver, getCredentialsFromEnv, TypedValues } from "ydb-sdk";
import { Ydb } from "telegraf-session-store-ydb";
import path from "path";
import { MOUNT_ROOT_DIR_PATH, YDB_DATABASE, YDB_ENDPOINT } from "./env";
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

export const trackUpdate = async (update: Update) => {
  try {
    // Table is pre-provisioned; avoid schema operations on hot path
    // await initUpdatesTable();
    console.log("Table 'updates' is ready");

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
      console.log("Inserted update with ID:", update.update_id);
    });
  } catch (error) {
    console.warn("save update error", error);
  }
};
