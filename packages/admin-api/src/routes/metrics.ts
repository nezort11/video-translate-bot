import { Router, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import {
  getOverviewMetrics,
  getNewUsersTimeSeries,
  getDauHistory,
} from "../services/ydb";

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

// GET /api/metrics/overview - Get overview metrics
router.get("/overview", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { from: fromParam, to: toParam } = req.query as {
      from?: string;
      to?: string;
    };
    const { from, to } = parseDateRange(fromParam, toParam);

    // Get metrics directly from YDB with SQL aggregations
    const metrics = await getOverviewMetrics(from, to);

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

    // Get new users time series directly from YDB with SQL aggregations
    const data = await getNewUsersTimeSeries(from, to);

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

    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    // Get overview metrics which includes DAU/WAU/MAU
    const metrics = await getOverviewMetrics(from, to);

    // Extract the relevant metric based on period
    let activeUsers: number;
    if (period === "1d") {
      activeUsers = metrics.dau;
    } else if (period === "7d") {
      activeUsers = metrics.wau;
    } else {
      activeUsers = metrics.mau;
    }

    res.json({
      period,
      days,
      activeUsers,
      from: from.toISOString(),
      to: to.toISOString(),
    });
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

    // Get DAU history directly from YDB with SQL aggregations
    const data = await getDauHistory(from, to);

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
