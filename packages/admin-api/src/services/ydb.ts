import {
  Driver,
  getCredentialsFromEnv,
  TypedValues,
  TypedData,
  ExecuteScanQuerySettings,
  Ydb,
} from "ydb-sdk";
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

/**
 * Helper to execute scan query and collect all results
 * Scan queries are better for analytical workloads on large tables
 */
async function executeScanQuery<T>(
  query: string,
  params: Record<string, any>
): Promise<T[]> {
  const driver = getDriver();
  const results: T[] = [];

  await driver.tableClient.withSessionRetry(async (session) => {
    await session.streamExecuteScanQuery(
      query,
      (result) => {
        if (result.resultSet) {
          const rows = TypedData.createNativeObjects(result.resultSet) as T[];
          results.push(...rows);
        }
      },
      params,
      new ExecuteScanQuerySettings()
    );
  });

  return results;
}

export interface UpdateRow {
  update_id: number;
  update_data: string;
}

/**
 * Get basic statistics about updates in a date range
 * This function performs all calculations in YDB using aggregations
 * NOTE: This replaces the old scanUpdates function which used LIMIT 10000
 */
export const getUpdatesStats = async (
  fromDate?: Date,
  toDate?: Date
): Promise<{
  totalCount: number;
  oldestUpdateId: number | null;
  newestUpdateId: number | null;
  dateRange: { from: string; to: string };
}> => {
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
    `[ydb] Getting updates stats between ${effectiveFromDate.toISOString()} and ${effectiveToDate.toISOString()}`
  );

  let stats = {
    totalCount: 0,
    oldestUpdateId: null as number | null,
    newestUpdateId: null as number | null,
    dateRange: {
      from: effectiveFromDate.toISOString(),
      to: effectiveToDate.toISOString(),
    },
  };

  try {
    // OPTIMIZED: Use indexed event_timestamp column for filtering (no full table scan!)
    const query = `
      DECLARE $fromTimestamp AS Uint64;
      DECLARE $toTimestamp AS Uint64;

      SELECT
        COUNT(*) AS total_count,
        MIN(update_id) AS oldest_update_id,
        MAX(update_id) AS newest_update_id
      FROM updates VIEW idx_event_timestamp
      WHERE event_timestamp >= $fromTimestamp
        AND event_timestamp <= $toTimestamp
        AND event_timestamp IS NOT NULL;
    `;

    console.log("[ydb] Executing aggregation query (indexed, no full scan)");
    const rows = await executeScanQuery<any>(query, {
      $fromTimestamp: TypedValues.uint64(fromTimestamp),
      $toTimestamp: TypedValues.uint64(toTimestamp),
    });

    if (rows[0]) {
      stats.totalCount = Number(rows[0].total_count || 0);
      stats.oldestUpdateId = rows[0].oldest_update_id
        ? Number(rows[0].oldest_update_id)
        : null;
      stats.newestUpdateId = rows[0].newest_update_id
        ? Number(rows[0].newest_update_id)
        : null;
    }
  } catch (error) {
    console.error("[ydb] Error fetching updates stats:", error);
    throw error;
  }

  console.log(`[ydb] Updates stats:`, stats);
  return stats;
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

// ============================================================================
// NEW: SQL-BASED AGGREGATION FUNCTIONS (optimized for millions of rows)
// ============================================================================
// IMPORTANT: These functions require the `event_timestamp` indexed column!
// Run: npx ts-node scripts/migrate-add-timestamp.ts
// ============================================================================

/**
 * Interface for overview metrics
 */
export interface OverviewMetrics {
  totalUniqueUsers: number;
  newUsersCount: number;
  messagesCount: number;
  dau: number;
  wau: number;
  mau: number;
  period: {
    from: string;
    to: string;
  };
}

/**
 * Get overview metrics (DAU, WAU, MAU, unique users, new users, messages count)
 * OPTIMIZED: Uses indexed event_timestamp column for pre-filtering (no full table scan!)
 */
export const getOverviewMetrics = async (
  from: Date,
  to: Date
): Promise<OverviewMetrics> => {
  const fromTimestamp = Math.floor(from.getTime() / 1000);
  const toTimestamp = Math.floor(to.getTime() / 1000);
  const oneDayAgo = Math.floor((to.getTime() - 24 * 60 * 60 * 1000) / 1000);
  const sevenDaysAgo = Math.floor(
    (to.getTime() - 7 * 24 * 60 * 60 * 1000) / 1000
  );
  const thirtyDaysAgo = Math.floor(
    (to.getTime() - 30 * 24 * 60 * 60 * 1000) / 1000
  );

  console.log(
    `[ydb] Fetching overview metrics (indexed scan) from ${from.toISOString()} to ${to.toISOString()}`
  );

  const metrics: OverviewMetrics = {
    totalUniqueUsers: 0,
    newUsersCount: 0,
    messagesCount: 0,
    dau: 0,
    wau: 0,
    mau: 0,
    period: { from: from.toISOString(), to: to.toISOString() },
  };

  try {
    // OPTIMIZED: Filter by indexed event_timestamp FIRST, then parse JSON only for matched rows
    const mainQuery = `
      DECLARE $fromTimestamp AS Uint64;
      DECLARE $toTimestamp AS Uint64;
      DECLARE $oneDayAgo AS Uint64;
      DECLARE $sevenDaysAgo AS Uint64;
      DECLARE $thirtyDaysAgo AS Uint64;

      -- Pre-filter using indexed column (uses index!)
      $filtered_updates = (
        SELECT event_timestamp, update_data
        FROM updates VIEW idx_event_timestamp
        WHERE event_timestamp >= $thirtyDaysAgo  -- Get 30-day window for MAU
          AND event_timestamp <= $toTimestamp
          AND event_timestamp IS NOT NULL
      );

      -- Extract user_id only for filtered rows (much smaller dataset)
      $all_events = (
        SELECT
          COALESCE(
            CAST(JSON_VALUE(update_data, "$.message.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.callback_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.inline_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.my_chat_member.from.id") AS Uint64)
          ) AS user_id,
          event_timestamp,
          COALESCE(
            JSON_VALUE(update_data, "$.message.from.is_bot"),
            JSON_VALUE(update_data, "$.callback_query.from.is_bot"),
            JSON_VALUE(update_data, "$.inline_query.from.is_bot"),
            JSON_VALUE(update_data, "$.my_chat_member.from.is_bot")
          ) AS is_bot
        FROM $filtered_updates
        WHERE COALESCE(
          JSON_VALUE(update_data, "$.message.from.is_bot"),
          JSON_VALUE(update_data, "$.callback_query.from.is_bot"),
          JSON_VALUE(update_data, "$.inline_query.from.is_bot"),
          JSON_VALUE(update_data, "$.my_chat_member.from.is_bot")
        ) != "true"
      );

      SELECT
        COUNT(DISTINCT CASE WHEN event_timestamp >= $fromTimestamp THEN user_id ELSE NULL END) AS total_unique_users,
        SUM(CASE WHEN event_timestamp >= $fromTimestamp THEN 1 ELSE 0 END) AS messages_count,
        COUNT(DISTINCT CASE WHEN event_timestamp >= $oneDayAgo THEN user_id ELSE NULL END) AS dau,
        COUNT(DISTINCT CASE WHEN event_timestamp >= $sevenDaysAgo THEN user_id ELSE NULL END) AS wau,
        COUNT(DISTINCT user_id) AS mau
      FROM $all_events
      WHERE user_id IS NOT NULL;
    `;

    const mainRows = await executeScanQuery<any>(mainQuery, {
      $fromTimestamp: TypedValues.uint64(fromTimestamp),
      $toTimestamp: TypedValues.uint64(toTimestamp),
      $oneDayAgo: TypedValues.uint64(oneDayAgo),
      $sevenDaysAgo: TypedValues.uint64(sevenDaysAgo),
      $thirtyDaysAgo: TypedValues.uint64(thirtyDaysAgo),
    });

    if (mainRows[0]) {
      metrics.totalUniqueUsers = Number(mainRows[0].total_unique_users || 0);
      metrics.messagesCount = Number(mainRows[0].messages_count || 0);
      metrics.dau = Number(mainRows[0].dau || 0);
      metrics.wau = Number(mainRows[0].wau || 0);
      metrics.mau = Number(mainRows[0].mau || 0);
    }

    // Query 2: New users - needs full table scan to find first_seen
    // This is inherently expensive but still uses index for date filtering
    const newUsersQuery = `
      DECLARE $fromTimestamp AS Uint64;
      DECLARE $toTimestamp AS Uint64;

      -- Get all user events (we need to find first-ever seen time)
      $all_events = (
        SELECT
          COALESCE(
            CAST(JSON_VALUE(update_data, "$.message.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.callback_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.inline_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.my_chat_member.from.id") AS Uint64)
          ) AS user_id,
          event_timestamp
        FROM updates
        WHERE event_timestamp IS NOT NULL
          AND COALESCE(
            JSON_VALUE(update_data, "$.message.from.is_bot"),
            JSON_VALUE(update_data, "$.callback_query.from.is_bot"),
            JSON_VALUE(update_data, "$.inline_query.from.is_bot"),
            JSON_VALUE(update_data, "$.my_chat_member.from.is_bot")
          ) != "true"
      );

      $first_seen = (
        SELECT user_id, MIN(event_timestamp) AS first_seen
        FROM $all_events
        WHERE user_id IS NOT NULL
        GROUP BY user_id
      );

      SELECT COUNT(*) AS new_users_count
      FROM $first_seen
      WHERE first_seen >= $fromTimestamp AND first_seen <= $toTimestamp;
    `;

    const newUsersRows = await executeScanQuery<any>(newUsersQuery, {
      $fromTimestamp: TypedValues.uint64(fromTimestamp),
      $toTimestamp: TypedValues.uint64(toTimestamp),
    });

    if (newUsersRows[0]) {
      metrics.newUsersCount = Number(newUsersRows[0].new_users_count || 0);
    }
  } catch (error) {
    console.error("[ydb] Error fetching overview metrics:", error);
    throw error;
  }

  console.log(`[ydb] Overview metrics:`, metrics);
  return metrics;
};

/**
 * Interface for daily new users data point
 */
export interface DailyNewUsers {
  date: string; // YYYY-MM-DD
  count: number;
}

/**
 * Get new users time series (daily counts)
 * OPTIMIZED: Uses indexed event_timestamp for filtering
 */
export const getNewUsersTimeSeries = async (
  from: Date,
  to: Date
): Promise<DailyNewUsers[]> => {
  const fromTimestamp = Math.floor(from.getTime() / 1000);
  const toTimestamp = Math.floor(to.getTime() / 1000);

  console.log(`[ydb] Fetching new users time series (indexed scan)`);

  try {
    // Note: New users query inherently needs full scan to find first_seen
    // We use event_timestamp column for efficiency
    const query = `
      DECLARE $fromTimestamp AS Uint64;
      DECLARE $toTimestamp AS Uint64;

      $all_events = (
        SELECT
          COALESCE(
            CAST(JSON_VALUE(update_data, "$.message.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.callback_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.inline_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.my_chat_member.from.id") AS Uint64)
          ) AS user_id,
          event_timestamp
        FROM updates
        WHERE event_timestamp IS NOT NULL
          AND COALESCE(
            JSON_VALUE(update_data, "$.message.from.is_bot"),
            JSON_VALUE(update_data, "$.callback_query.from.is_bot"),
            JSON_VALUE(update_data, "$.inline_query.from.is_bot"),
            JSON_VALUE(update_data, "$.my_chat_member.from.is_bot")
          ) != "true"
      );

      $first_seen_per_user = (
        SELECT user_id, MIN(event_timestamp) AS first_seen
        FROM $all_events
        WHERE user_id IS NOT NULL
        GROUP BY user_id
      );

      $filtered = (
        SELECT DateTime::Format(DateTime::FromSeconds(CAST(first_seen AS Uint32)), "%Y-%m-%d") AS date
        FROM $first_seen_per_user
        WHERE first_seen >= $fromTimestamp AND first_seen <= $toTimestamp
      );

      SELECT date, COUNT(*) AS count
      FROM $filtered
      GROUP BY date
      ORDER BY date;
    `;

    const rows = await executeScanQuery<any>(query, {
      $fromTimestamp: TypedValues.uint64(fromTimestamp),
      $toTimestamp: TypedValues.uint64(toTimestamp),
    });

    const results: DailyNewUsers[] = rows.map((row) => ({
      date: String(row.date),
      count: Number(row.count || 0),
    }));

    const filledResults = fillMissingDays(results, from, to);
    console.log(`[ydb] New users time series: ${filledResults.length} days`);
    return filledResults;
  } catch (error) {
    console.error("[ydb] Error fetching new users time series:", error);
    throw error;
  }
};

/**
 * Interface for DAU history data point
 */
export interface DauHistoryPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

/**
 * Get DAU history (daily active users count for each day in range)
 * OPTIMIZED: Uses indexed event_timestamp for pre-filtering
 */
export const getDauHistory = async (
  from: Date,
  to: Date
): Promise<DauHistoryPoint[]> => {
  const fromTimestamp = Math.floor(from.getTime() / 1000);
  const toTimestamp = Math.floor(to.getTime() / 1000);

  console.log(`[ydb] Fetching DAU history (indexed scan)`);

  try {
    // OPTIMIZED: Pre-filter by indexed event_timestamp column
    const query = `
      DECLARE $fromTimestamp AS Uint64;
      DECLARE $toTimestamp AS Uint64;

      -- Pre-filter using indexed column (uses index!)
      $filtered_updates = (
        SELECT event_timestamp, update_data
        FROM updates VIEW idx_event_timestamp
        WHERE event_timestamp >= $fromTimestamp
          AND event_timestamp <= $toTimestamp
          AND event_timestamp IS NOT NULL
      );

      -- Extract user_id only for filtered rows
      $range_events = (
        SELECT
          COALESCE(
            CAST(JSON_VALUE(update_data, "$.message.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.callback_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.inline_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.my_chat_member.from.id") AS Uint64)
          ) AS user_id,
          event_timestamp
        FROM $filtered_updates
        WHERE COALESCE(
          JSON_VALUE(update_data, "$.message.from.is_bot"),
          JSON_VALUE(update_data, "$.callback_query.from.is_bot"),
          JSON_VALUE(update_data, "$.inline_query.from.is_bot"),
          JSON_VALUE(update_data, "$.my_chat_member.from.is_bot")
        ) != "true"
      );

      SELECT
        DateTime::Format(DateTime::FromSeconds(CAST(event_timestamp AS Uint32)), "%Y-%m-%d") AS date,
        COUNT(DISTINCT user_id) AS count
      FROM $range_events
      WHERE user_id IS NOT NULL
      GROUP BY DateTime::Format(DateTime::FromSeconds(CAST(event_timestamp AS Uint32)), "%Y-%m-%d")
      ORDER BY date;
    `;

    const rows = await executeScanQuery<any>(query, {
      $fromTimestamp: TypedValues.uint64(fromTimestamp),
      $toTimestamp: TypedValues.uint64(toTimestamp),
    });

    const results: DauHistoryPoint[] = rows.map((row) => ({
      date: String(row.date),
      count: Number(row.count || 0),
    }));

    const filledResults = fillMissingDays(results, from, to);
    console.log(`[ydb] DAU history: ${filledResults.length} days`);
    return filledResults;
  } catch (error) {
    console.error("[ydb] Error fetching DAU history:", error);
    throw error;
  }
};

/**
 * Interface for user stats
 */
export interface UserStats {
  userId: number;
  firstSeenAt: string;
  lastSeenAt: string;
  messagesCount: number;
}

/**
 * Get paginated list of users with their stats
 * OPTIMIZED: Uses indexed event_timestamp for pre-filtering
 */
export const getUsersList = async (
  from: Date,
  to: Date,
  limit: number,
  offset: number,
  sort: string,
  order: string
): Promise<{ users: UserStats[]; total: number }> => {
  const fromTimestamp = Math.floor(from.getTime() / 1000);
  const toTimestamp = Math.floor(to.getTime() / 1000);

  console.log(
    `[ydb] Fetching users list (indexed scan) limit: ${limit}, offset: ${offset}`
  );

  let sortColumn = "last_seen";
  if (sort === "userId") sortColumn = "user_id";
  else if (sort === "firstSeenAt") sortColumn = "first_seen";
  else if (sort === "messagesCount") sortColumn = "messages_count";

  const orderDirection = order === "asc" ? "ASC" : "DESC";

  try {
    // OPTIMIZED: Pre-filter by indexed event_timestamp column
    // Query 1: Get total count
    const countQuery = `
      DECLARE $fromTimestamp AS Uint64;
      DECLARE $toTimestamp AS Uint64;

      -- Pre-filter using indexed column (uses index!)
      $filtered_updates = (
        SELECT event_timestamp, update_data
        FROM updates VIEW idx_event_timestamp
        WHERE event_timestamp >= $fromTimestamp
          AND event_timestamp <= $toTimestamp
          AND event_timestamp IS NOT NULL
      );

      $range_events = (
        SELECT
          COALESCE(
            CAST(JSON_VALUE(update_data, "$.message.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.callback_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.inline_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.my_chat_member.from.id") AS Uint64)
          ) AS user_id
        FROM $filtered_updates
        WHERE COALESCE(
          JSON_VALUE(update_data, "$.message.from.is_bot"),
          JSON_VALUE(update_data, "$.callback_query.from.is_bot"),
          JSON_VALUE(update_data, "$.inline_query.from.is_bot"),
          JSON_VALUE(update_data, "$.my_chat_member.from.is_bot")
        ) != "true"
      );

      SELECT COUNT(DISTINCT user_id) AS total
      FROM $range_events
      WHERE user_id IS NOT NULL;
    `;

    const countRows = await executeScanQuery<any>(countQuery, {
      $fromTimestamp: TypedValues.uint64(fromTimestamp),
      $toTimestamp: TypedValues.uint64(toTimestamp),
    });

    const total = countRows[0] ? Number(countRows[0].total || 0) : 0;

    // Query 2: Get paginated user data
    const dataQuery = `
      DECLARE $fromTimestamp AS Uint64;
      DECLARE $toTimestamp AS Uint64;
      DECLARE $limit AS Uint64;
      DECLARE $offset AS Uint64;

      -- Pre-filter using indexed column (uses index!)
      $filtered_updates = (
        SELECT event_timestamp, update_data
        FROM updates VIEW idx_event_timestamp
        WHERE event_timestamp >= $fromTimestamp
          AND event_timestamp <= $toTimestamp
          AND event_timestamp IS NOT NULL
      );

      $range_events = (
        SELECT
          COALESCE(
            CAST(JSON_VALUE(update_data, "$.message.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.callback_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.inline_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.my_chat_member.from.id") AS Uint64)
          ) AS user_id,
          event_timestamp
        FROM $filtered_updates
        WHERE COALESCE(
          JSON_VALUE(update_data, "$.message.from.is_bot"),
          JSON_VALUE(update_data, "$.callback_query.from.is_bot"),
          JSON_VALUE(update_data, "$.inline_query.from.is_bot"),
          JSON_VALUE(update_data, "$.my_chat_member.from.is_bot")
        ) != "true"
      );

      SELECT
        user_id,
        MIN(event_timestamp) AS first_seen,
        MAX(event_timestamp) AS last_seen,
        COUNT(*) AS messages_count
      FROM $range_events
      WHERE user_id IS NOT NULL
      GROUP BY user_id
      ORDER BY ${sortColumn} ${orderDirection}
      LIMIT $limit OFFSET $offset;
    `;

    const dataRows = await executeScanQuery<any>(dataQuery, {
      $fromTimestamp: TypedValues.uint64(fromTimestamp),
      $toTimestamp: TypedValues.uint64(toTimestamp),
      $limit: TypedValues.uint64(limit),
      $offset: TypedValues.uint64(offset),
    });

    const users: UserStats[] = dataRows.map((row) => ({
      userId: Number(row.user_id),
      firstSeenAt: new Date(Number(row.first_seen) * 1000).toISOString(),
      lastSeenAt: new Date(Number(row.last_seen) * 1000).toISOString(),
      messagesCount: Number(row.messages_count || 0),
    }));

    console.log(`[ydb] Users list: ${users.length} users (total: ${total})`);
    return { users, total };
  } catch (error) {
    console.error("[ydb] Error fetching users list:", error);
    throw error;
  }
};

/**
 * Interface for user details
 */
export interface UserDetails {
  userId: number;
  firstSeenAt: string;
  lastSeenAt: string;
  messagesCount: number;
  updateTypes: Record<string, number>;
}

/**
 * Get detailed stats for a specific user
 */
export const getUserDetails = async (
  userId: number
): Promise<UserDetails | null> => {
  const driver = getDriver();

  console.log(`[ydb] Fetching details for user ${userId}`);

  let userDetails: UserDetails | null = null;

  try {
    await driver.tableClient.withSessionRetry(async (session) => {
      const query = `
        DECLARE $userId AS Uint64;

        -- Extract all events for this user, filtering out bots
        $user_events = (
          SELECT
            update_id,
            update_data,
            COALESCE(
              CAST(JSON_VALUE(update_data, "$.message.from.id") AS Uint64),
              CAST(JSON_VALUE(update_data, "$.edited_message.from.id") AS Uint64),
              CAST(JSON_VALUE(update_data, "$.callback_query.from.id") AS Uint64),
              CAST(JSON_VALUE(update_data, "$.inline_query.from.id") AS Uint64),
              CAST(JSON_VALUE(update_data, "$.chosen_inline_result.from.id") AS Uint64),
              CAST(JSON_VALUE(update_data, "$.my_chat_member.from.id") AS Uint64)
            ) AS user_id,
            COALESCE(
              CAST(JSON_VALUE(update_data, "$.message.date") AS Uint64),
              CAST(JSON_VALUE(update_data, "$.edited_message.edit_date") AS Uint64),
              CAST(JSON_VALUE(update_data, "$.callback_query.message.date") AS Uint64),
              CAST(JSON_VALUE(update_data, "$.inline_query.date") AS Uint64),
              CAST(JSON_VALUE(update_data, "$.my_chat_member.date") AS Uint64)
            ) AS event_timestamp,
            -- Determine update type
            CASE
              WHEN JSON_VALUE(update_data, "$.message") IS NOT NULL THEN "message"
              WHEN JSON_VALUE(update_data, "$.edited_message") IS NOT NULL THEN "edited_message"
              WHEN JSON_VALUE(update_data, "$.callback_query") IS NOT NULL THEN "callback_query"
              WHEN JSON_VALUE(update_data, "$.inline_query") IS NOT NULL THEN "inline_query"
              WHEN JSON_VALUE(update_data, "$.chosen_inline_result") IS NOT NULL THEN "chosen_inline_result"
              WHEN JSON_VALUE(update_data, "$.my_chat_member") IS NOT NULL THEN "my_chat_member"
              ELSE "unknown"
            END AS update_type
          FROM updates
          WHERE COALESCE(
            CAST(JSON_VALUE(update_data, "$.message.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.edited_message.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.callback_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.inline_query.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.chosen_inline_result.from.id") AS Uint64),
            CAST(JSON_VALUE(update_data, "$.my_chat_member.from.id") AS Uint64)
          ) = $userId
          -- Filter out bots
          AND COALESCE(
            JSON_VALUE(update_data, "$.message.from.is_bot"),
            JSON_VALUE(update_data, "$.edited_message.from.is_bot"),
            JSON_VALUE(update_data, "$.callback_query.from.is_bot"),
            JSON_VALUE(update_data, "$.inline_query.from.is_bot"),
            JSON_VALUE(update_data, "$.chosen_inline_result.from.is_bot"),
            JSON_VALUE(update_data, "$.my_chat_member.from.is_bot")
          ) != "true"
        );

        -- Get overall stats
        $user_stats = (
          SELECT
            user_id,
            MIN(event_timestamp) AS first_seen,
            MAX(event_timestamp) AS last_seen,
            COUNT(*) AS messages_count
          FROM $user_events
          GROUP BY user_id
        );

        -- Get update type breakdown
        $type_breakdown = (
          SELECT
            update_type,
            COUNT(*) AS type_count
          FROM $user_events
          GROUP BY update_type
        );

        -- Combine results
        SELECT
          s.user_id AS user_id,
          s.first_seen AS first_seen,
          s.last_seen AS last_seen,
          s.messages_count AS messages_count,
          t.update_type AS update_type,
          t.type_count AS type_count
        FROM $user_stats AS s
        CROSS JOIN $type_breakdown AS t;
      `;

      const result = await session.executeQuery(query, {
        $userId: TypedValues.uint64(userId),
      });

      if (result.resultSets && result.resultSets[0]) {
        const resultSet = result.resultSets[0];
        const rows = TypedData.createNativeObjects(resultSet) as any[];

        if (rows.length > 0) {
          const updateTypes: Record<string, number> = {};

          for (const row of rows) {
            if (!userDetails) {
              userDetails = {
                userId: Number(row.user_id),
                firstSeenAt: new Date(
                  Number(row.first_seen) * 1000
                ).toISOString(),
                lastSeenAt: new Date(
                  Number(row.last_seen) * 1000
                ).toISOString(),
                messagesCount: Number(row.messages_count || 0),
                updateTypes: {},
              };
            }

            if (row.update_type) {
              updateTypes[String(row.update_type)] = Number(
                row.type_count || 0
              );
            }
          }

          if (userDetails) {
            userDetails.updateTypes = updateTypes;
          }
        }
      }
    });
  } catch (error) {
    console.error("[ydb] Error fetching user details:", error);
    throw error;
  }

  console.log(`[ydb] User details fetched for user ${userId}`);
  return userDetails;
};

/**
 * Helper function to fill in missing days with count = 0
 */
function fillMissingDays(
  data: Array<{ date: string; count: number }>,
  from: Date,
  to: Date
): Array<{ date: string; count: number }> {
  const result: Array<{ date: string; count: number }> = [];
  const dataMap = new Map(data.map((d) => [d.date, d.count]));

  const current = new Date(from);
  current.setHours(0, 0, 0, 0);

  const endDate = new Date(to);
  endDate.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    const dateKey = current.toISOString().split("T")[0];
    result.push({
      date: dateKey,
      count: dataMap.get(dateKey) || 0,
    });
    current.setDate(current.getDate() + 1);
  }

  return result;
}
