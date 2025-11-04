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

export const trackUpdate = async (update: Update) => {
  try {
    // Table is pre-provisioned; avoid schema operations on hot path
    // await initUpdatesTable();
    console.log("Table 'updates' is ready");

    await driver.tableClient.withSessionRetry(async (session) => {
      await session.executeQuery(
        `DECLARE $update_id AS Uint64;
       DECLARE $update_data AS Json;
       UPSERT INTO updates (update_id, update_data)
       VALUES ($update_id, $update_data);`,
        {
          $update_id: TypedValues.uint64(update.update_id),
          // Convert your update object to a JSON string
          $update_data: TypedValues.json(JSON.stringify(update)),
        }
      );
      console.log("Inserted update with ID:", update.update_id);
    });

    // await db.insert(updatesTable).values({
    //   updateId: update.update_id,
    //   updateData: update,
    // });
  } catch (error) {
    // handleWarnError("save update error", error);
    console.warn("save update error", error);
  }
};
