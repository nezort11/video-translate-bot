import { Driver, getCredentialsFromEnv, TypedValues, TypedData } from "ydb-sdk";
import {
  YDB_ENDPOINT,
  YDB_DATABASE,
  YDB_SERVICE_ACCOUNT_KEY_PATH,
  LAMBDA_TASK_ROOT,
} from "../env";

// Set YDB credentials path for production
if (LAMBDA_TASK_ROOT) {
  process.env.YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS =
    YDB_SERVICE_ACCOUNT_KEY_PATH;
}

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
        operationTimeout: 30000,
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
  const results: UpdateRow[] = [];

  await driver.tableClient.withSessionRetry(async (session) => {
    // For now, scan all updates and filter in memory
    // YDB doesn't have efficient date filtering on JSON fields
    const query = `
      SELECT update_id, update_data
      FROM updates
      LIMIT 10000;
    `;

    const result = await session.executeQuery(query);

    if (result.resultSets && result.resultSets[0]) {
      const resultSet = result.resultSets[0];
      const rows = TypedData.createNativeObjects(resultSet) as any[];
      for (const row of rows) {
        results.push({
          update_id: Number(row.update_id),
          update_data:
            typeof row.update_data === "string"
              ? row.update_data
              : JSON.stringify(row.update_data),
        });
      }
    }
  });

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
