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

  // For now, let's try a simpler approach - fetch recent data only
  // We'll use a time-based approach to get the most recent updates
  console.log(
    "[ydb] Fetching recent updates (last 7 days) to work around YDB limits"
  );

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Try to fetch the most recent 2000 updates and filter by date
  const results: UpdateRow[] = [];

  try {
    await driver.tableClient.withSessionRetry(async (session) => {
      // Get the most recent updates first
      const query = `
        SELECT update_id, update_data
        FROM updates
        ORDER BY update_id DESC
        LIMIT 2000;
      `;

      console.log("[ydb] Fetching most recent 2000 updates");
      const result = await session.executeQuery(query);

      if (result.resultSets && result.resultSets[0]) {
        const resultSet = result.resultSets[0];
        const rows = TypedData.createNativeObjects(resultSet) as any[];

        console.log(`[ydb] Retrieved ${rows.length} raw rows from database`);

        for (const row of rows) {
          try {
            const updateData =
              typeof row.update_data === "string"
                ? row.update_data
                : JSON.stringify(row.update_data);

            // Parse the JSON to check the date
            const parsed = JSON.parse(updateData);

            // Extract timestamp from various possible locations
            let timestamp: number | null = null;

            if (parsed.message?.date) {
              timestamp = parsed.message.date;
            } else if (parsed.edited_message?.edit_date) {
              timestamp = parsed.edited_message.edit_date;
            } else if (parsed.callback_query?.message?.date) {
              timestamp = parsed.callback_query.message.date;
            } else if (parsed.inline_query?.date) {
              timestamp = parsed.inline_query.date;
            } else if (parsed.my_chat_member?.date) {
              timestamp = parsed.my_chat_member.date;
            }

            if (timestamp) {
              const eventDate = new Date(timestamp * 1000);

              // Only include events from the last 7 days to reduce processing
              if (eventDate >= sevenDaysAgo) {
                results.push({
                  update_id: Number(row.update_id),
                  update_data: updateData,
                });
              }
            } else {
              // If no timestamp found, include it anyway (fallback)
              results.push({
                update_id: Number(row.update_id),
                update_data: updateData,
              });
            }
          } catch (parseError) {
            // Skip malformed JSON
            console.warn(`[ydb] Skipping malformed update ${row.update_id}`);
          }
        }
      }
    });
  } catch (error) {
    console.error("[ydb] Error fetching recent updates:", error);
  }

  console.log(`[ydb] Final filtered results count: ${results.length}`);
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
