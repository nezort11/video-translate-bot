import { Driver, getCredentialsFromEnv, TypedValues, TypedData } from "ydb-sdk";
import {
  YDB_ENDPOINT,
  YDB_DATABASE,
  YDB_SERVICE_ACCOUNT_KEY_PATH,
  LAMBDA_TASK_ROOT,
} from "../env";

// Set YDB credentials path for both production and local development
process.env.YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS =
  YDB_SERVICE_ACCOUNT_KEY_PATH;

console.log(
  "[ydb] Using service account key from:",
  YDB_SERVICE_ACCOUNT_KEY_PATH
);

let driverInstance: Driver | null = null;

export const getDriver = (): Driver => {
  if (!driverInstance) {
    if (!YDB_ENDPOINT || !YDB_DATABASE) {
      throw new Error("YDB_ENDPOINT and YDB_DATABASE must be set");
    }
    driverInstance = new Driver({
      endpoint: YDB_ENDPOINT,
      database: YDB_DATABASE,
      authService: getCredentialsFromEnv(),
      clientOptions: {
        operationTimeout: process.env.NODE_ENV === "test" ? 10000 : 30000,
      },
    });
  }
  return driverInstance;
};

export interface UpdateRow {
  update_id: number;
  update_data: string;
}

/**
 * Scan all updates from YDB within a date range
 */
export const scanUpdates = async (
  fromDate?: Date,
  toDate?: Date
): Promise<UpdateRow[]> => {
  const driver = getDriver();

  // Default to last 7 days if no date range specified
  const defaultFromDate = new Date();
  defaultFromDate.setDate(defaultFromDate.getDate() - 7);

  const effectiveFromDate = fromDate || defaultFromDate;
  const effectiveToDate = toDate || new Date();

  // Convert dates to Unix timestamps (seconds)
  const fromTimestamp = Math.floor(effectiveFromDate.getTime() / 1000);
  const toTimestamp = Math.floor(effectiveToDate.getTime() / 1000);

  console.log(
    `[ydb] Fetching updates between ${effectiveFromDate.toISOString()} and ${effectiveToDate.toISOString()}`
  );

  const results: UpdateRow[] = [];

  try {
    await driver.tableClient.withSessionRetry(async (session) => {
      // Use JSON_VALUE to extract timestamps directly in SQL
      // Try multiple paths where timestamp might be located
      // COALESCE returns the first non-null value
      const query = `
        DECLARE $fromTimestamp AS Uint64;
        DECLARE $toTimestamp AS Uint64;

        SELECT
          update_id,
          update_data,
          COALESCE(
            CAST(JSON_VALUE(update_data, "$.message.date") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.edited_message.edit_date") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.callback_query.message.date") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.inline_query.date") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.my_chat_member.date") AS Uint64)
          ) AS extracted_timestamp
        FROM updates
        WHERE COALESCE(
          CAST(JSON_VALUE(update_data, "$.message.date") AS Uint64),
          CAST(JSON_VALUE(update_data, "$.edited_message.edit_date") AS Uint64),
          CAST(JSON_VALUE(update_data, "$.callback_query.message.date") AS Uint64),
          CAST(JSON_VALUE(update_data, "$.inline_query.date") AS Uint64),
          CAST(JSON_VALUE(update_data, "$.my_chat_member.date") AS Uint64)
        ) >= $fromTimestamp
        AND COALESCE(
          CAST(JSON_VALUE(update_data, "$.message.date") AS Uint64),
          CAST(JSON_VALUE(update_data, "$.edited_message.edit_date") AS Uint64),
          CAST(JSON_VALUE(update_data, "$.callback_query.message.date") AS Uint64),
          CAST(JSON_VALUE(update_data, "$.inline_query.date") AS Uint64),
          CAST(JSON_VALUE(update_data, "$.my_chat_member.date") AS Uint64)
        ) <= $toTimestamp
        ORDER BY update_id DESC
        LIMIT 10000;
      `;

      console.log("[ydb] Executing optimized query with JSON_VALUE filtering");
      const result = await session.executeQuery(query, {
        $fromTimestamp: TypedValues.uint64(fromTimestamp),
        $toTimestamp: TypedValues.uint64(toTimestamp),
      });

      if (result.resultSets && result.resultSets[0]) {
        const resultSet = result.resultSets[0];
        const rows = TypedData.createNativeObjects(resultSet) as any[];

        console.log(
          `[ydb] Retrieved ${rows.length} rows from database (already filtered by date in SQL)`
        );

        for (const row of rows) {
          const updateData =
            typeof row.update_data === "string"
              ? row.update_data
              : JSON.stringify(row.update_data);

          results.push({
            update_id: Number(row.update_id),
            update_data: updateData,
          });
        }
      }
    });
  } catch (error) {
    console.error("[ydb] Error fetching updates:", error);
    throw error;
  }

  console.log(`[ydb] Final results count: ${results.length}`);
  return results;
};

/**
 * Count total updates in the table
 */
export const countUpdates = async (): Promise<number> => {
  const driver = getDriver();
  let count = 0;

  await driver.tableClient.withSessionRetry(async (session) => {
    const result = await session.executeQuery(`
      SELECT COUNT(*) as cnt FROM updates;
    `);

    if (result.resultSets && result.resultSets[0]) {
      const resultSet = result.resultSets[0];
      const rows = TypedData.createNativeObjects(resultSet) as any[];
      if (rows[0]) {
        count = Number(rows[0].cnt);
      }
    }
  });

  return count;
};
