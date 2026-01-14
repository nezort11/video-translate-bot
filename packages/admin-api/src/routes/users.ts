import { Router, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { getUsersList, getUserDetails } from "../services/ydb";

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

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get users directly from YDB with SQL aggregations, sorting, and pagination
    const { users, total } = await getUsersList(from, to, limit, offset, sort, order);

    const totalPages = Math.ceil(total / limit);

    res.json({
      items: users,
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

    // Get user details directly from YDB with SQL aggregations
    const userDetails = await getUserDetails(userId);

    if (!userDetails) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(userDetails);
  } catch (error) {
    console.error("[users] Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;
