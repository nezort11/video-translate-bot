import { Router, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { scanUpdates } from "../services/ydb";
import { getOrCompute } from "../services/cache";
import {
  extractEvents,
  filterByDateRange,
  getUniqueUserIds,
  countNewUsers,
  groupNewUsersByDay,
  ExtractedEvent,
} from "../utils/extractor";

const router: Router = Router();

// All metrics routes require authentication
router.use(authMiddleware);

/**
 * Parse date query params with defaults
 */
const parseDateRange = (
  fromParam?: string,
  toParam?: string
): { from: Date; to: Date } => {
  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam
    ? new Date(fromParam)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

  return { from, to };
};

/**
 * Get all events (cached)
 */
const getAllEvents = async (): Promise<ExtractedEvent[]> => {
  return getOrCompute("all_events", async () => {
    const updates = await scanUpdates();
    return extractEvents(updates);
  });
};

// GET /api/metrics/overview - Get overview metrics
router.get("/overview", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { from: fromParam, to: toParam } = req.query as {
      from?: string;
      to?: string;
    };
    const { from, to } = parseDateRange(fromParam, toParam);

    const cacheKey = `overview_${from.toISOString()}_${to.toISOString()}`;

    const metrics = await getOrCompute(cacheKey, async () => {
      const allEvents = await getAllEvents();
      const rangeEvents = filterByDateRange(allEvents, from, to);

      // Total unique users in range
      const totalUniqueUsers = getUniqueUserIds(rangeEvents).length;

      // New users in range
      const newUsersCount = countNewUsers(allEvents, from, to);

      // Total messages in range
      const messagesCount = rangeEvents.length;

      // DAU: unique users in last 1 day
      const oneDayAgo = new Date(to.getTime() - 24 * 60 * 60 * 1000);
      const dauEvents = filterByDateRange(allEvents, oneDayAgo, to);
      const dau = getUniqueUserIds(dauEvents).length;

      // WAU: unique users in last 7 days
      const sevenDaysAgo = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      const wauEvents = filterByDateRange(allEvents, sevenDaysAgo, to);
      const wau = getUniqueUserIds(wauEvents).length;

      // MAU: unique users in last 30 days
      const thirtyDaysAgo = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      const mauEvents = filterByDateRange(allEvents, thirtyDaysAgo, to);
      const mau = getUniqueUserIds(mauEvents).length;

      return {
        totalUniqueUsers,
        newUsersCount,
        messagesCount,
        dau,
        wau,
        mau,
        period: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
      };
    });

    res.json(metrics);
  } catch (error) {
    console.error("[metrics] Error in overview:", error);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

// GET /api/metrics/new-users - Get daily new users time series
router.get("/new-users", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { from: fromParam, to: toParam } = req.query as {
      from?: string;
      to?: string;
    };
    const { from, to } = parseDateRange(fromParam, toParam);

    const cacheKey = `new_users_${from.toISOString()}_${to.toISOString()}`;

    const data = await getOrCompute(cacheKey, async () => {
      const allEvents = await getAllEvents();
      return groupNewUsersByDay(allEvents, from, to);
    });

    res.json({
      data,
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    });
  } catch (error) {
    console.error("[metrics] Error in new-users:", error);
    res.status(500).json({ error: "Failed to fetch new users data" });
  }
});

// GET /api/metrics/active - Get active users by period
router.get("/active", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = "7d" } = req.query as { period?: string };

    // Parse period
    let days: number;
    switch (period) {
      case "1d":
        days = 1;
        break;
      case "7d":
        days = 7;
        break;
      case "30d":
        days = 30;
        break;
      default:
        days = 7;
    }

    const cacheKey = `active_${period}`;

    const data = await getOrCompute(cacheKey, async () => {
      const allEvents = await getAllEvents();
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

      const rangeEvents = filterByDateRange(allEvents, from, to);
      const activeUsers = getUniqueUserIds(rangeEvents).length;

      return {
        period,
        days,
        activeUsers,
        from: from.toISOString(),
        to: to.toISOString(),
      };
    });

    res.json(data);
  } catch (error) {
    console.error("[metrics] Error in active:", error);
    res.status(500).json({ error: "Failed to fetch active users" });
  }
});

// GET /api/metrics/dau-history - Get DAU time series (for chart)
router.get("/dau-history", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { from: fromParam, to: toParam } = req.query as {
      from?: string;
      to?: string;
    };
    const { from, to } = parseDateRange(fromParam, toParam);

    const cacheKey = `dau_history_${from.toISOString()}_${to.toISOString()}`;

    const data = await getOrCompute(cacheKey, async () => {
      const allEvents = await getAllEvents();
      const result: Array<{ date: string; count: number }> = [];

      // Iterate through each day in the range
      const current = new Date(from);
      while (current <= to) {
        const dayStart = new Date(current);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(current);
        dayEnd.setHours(23, 59, 59, 999);

        const dayEvents = filterByDateRange(allEvents, dayStart, dayEnd);
        const uniqueUsers = getUniqueUserIds(dayEvents).length;

        result.push({
          date: current.toISOString().split("T")[0],
          count: uniqueUsers,
        });

        current.setDate(current.getDate() + 1);
      }

      return result;
    });

    res.json({
      data,
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    });
  } catch (error) {
    console.error("[metrics] Error in dau-history:", error);
    res.status(500).json({ error: "Failed to fetch DAU history" });
  }
});

export default router;
