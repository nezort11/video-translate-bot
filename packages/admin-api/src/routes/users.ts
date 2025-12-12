import { Router, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { scanUpdates } from "../services/ydb";
import { getOrCompute } from "../services/cache";
import {
  extractEvents,
  aggregateByUser,
  filterByDateRange,
  UserStats,
} from "../utils/extractor";

const router: Router = Router();

// All users routes require authentication
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

// GET /api/users - Get paginated users list
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      limit: limitParam = "50",
      page: pageParam = "1",
      from: fromParam,
      to: toParam,
      sort = "lastSeenAt",
      order = "desc",
    } = req.query as {
      limit?: string;
      page?: string;
      from?: string;
      to?: string;
      sort?: string;
      order?: string;
    };

    const limit = Math.min(100, Math.max(1, parseInt(limitParam, 10) || 50));
    const page = Math.max(1, parseInt(pageParam, 10) || 1);
    const { from, to } = parseDateRange(fromParam, toParam);

    const cacheKey = `users_${from.toISOString()}_${to.toISOString()}`;

    // Get all user stats (cached)
    const allUsers = await getOrCompute<UserStats[]>(cacheKey, async () => {
      const updates = await scanUpdates();
      const allEvents = extractEvents(updates);
      const rangeEvents = filterByDateRange(allEvents, from, to);
      return aggregateByUser(rangeEvents);
    });

    // Sort users
    const sortedUsers = [...allUsers].sort((a, b) => {
      let comparison = 0;

      switch (sort) {
        case "userId":
          comparison = a.userId - b.userId;
          break;
        case "firstSeenAt":
          comparison = a.firstSeenAt.getTime() - b.firstSeenAt.getTime();
          break;
        case "lastSeenAt":
          comparison = a.lastSeenAt.getTime() - b.lastSeenAt.getTime();
          break;
        case "messagesCount":
          comparison = a.messagesCount - b.messagesCount;
          break;
        default:
          comparison = a.lastSeenAt.getTime() - b.lastSeenAt.getTime();
      }

      return order === "asc" ? comparison : -comparison;
    });

    // Paginate
    const total = sortedUsers.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const items = sortedUsers.slice(offset, offset + limit);

    // Format response
    const formattedItems = items.map((user) => ({
      userId: user.userId,
      firstSeenAt: user.firstSeenAt.toISOString(),
      lastSeenAt: user.lastSeenAt.toISOString(),
      messagesCount: user.messagesCount,
    }));

    res.json({
      items: formattedItems,
      page,
      limit,
      total,
      totalPages,
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    });
  } catch (error) {
    console.error("[users] Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// GET /api/users/:userId - Get single user details
router.get("/:userId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);

    if (isNaN(userId)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const updates = await scanUpdates();
    const allEvents = extractEvents(updates);

    // Filter events for this user
    const userEvents = allEvents.filter((e) => e.userId === userId);

    if (userEvents.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Aggregate stats
    const stats = aggregateByUser(userEvents)[0];

    // Get update type breakdown
    const typeBreakdown: Record<string, number> = {};
    for (const event of userEvents) {
      typeBreakdown[event.updateType] =
        (typeBreakdown[event.updateType] || 0) + 1;
    }

    res.json({
      userId: stats.userId,
      firstSeenAt: stats.firstSeenAt.toISOString(),
      lastSeenAt: stats.lastSeenAt.toISOString(),
      messagesCount: stats.messagesCount,
      updateTypes: typeBreakdown,
    });
  } catch (error) {
    console.error("[users] Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;
