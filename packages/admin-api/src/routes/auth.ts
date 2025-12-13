import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN, NODE_ENV } from "../env";
import { verifyInitData, isAdmin } from "../services/telegram";

const router: Router = Router();

interface TelegramInitRequest {
  initData: string;
}

// POST /api/auth/telegram-init - Validate initData and issue JWT
router.post("/telegram-init", async (req: Request, res: Response) => {
  try {
    const { initData } = req.body as TelegramInitRequest;

    if (!initData || typeof initData !== "string") {
      res.status(400).json({ error: "Missing initData in request body" });
      return;
    }

    console.log("[auth] telegram-init request received");

    // Verify Telegram initData signature
    const verification = verifyInitData(initData);

    if (!verification.valid || !verification.data) {
      console.warn("[auth] initData verification failed:", verification.error);
      res.status(401).json({ error: verification.error || "Invalid initData" });
      return;
    }

    const userData = verification.data.user;

    if (!userData || !userData.id) {
      res.status(401).json({ error: "No user data in initData" });
      return;
    }

    // Check if user is in admin whitelist
    if (!isAdmin(userData.id)) {
      console.warn(
        `[auth] User ${userData.id} (${userData.username}) not in admin list`
      );
      res.status(403).json({ error: "User not authorized as admin" });
      return;
    }

    // Issue JWT token
    const payload = {
      sub: `tg:${userData.id}`,
      user_id: userData.id,
      username: userData.username,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    // Calculate expiration time
    const decoded = jwt.decode(token) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000).toISOString();

    // Log admin login
    console.log(
      `[auth] admin_login: user_id=${userData.id} username=${userData.username}`
    );

    res.json({
      token,
      expiresAt,
      user: {
        id: userData.id,
        firstName: userData.first_name,
        lastName: userData.last_name,
        username: userData.username,
      },
    });
  } catch (error) {
    console.error("[auth] Error in telegram-init:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// POST /api/auth/debug - Development-only endpoint for testing
// Only available in development mode
router.post("/debug", async (req: Request, res: Response) => {
  if (NODE_ENV !== "development") {
    res.status(403).json({ error: "Debug auth only available in development" });
    return;
  }

  try {
    console.log("[auth] debug endpoint called");

    // Create a mock admin user for development
    const adminId = 776696185; // Your admin ID

    const payload = {
      sub: `tg:${adminId}`,
      user_id: adminId,
      username: "admin",
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    const decoded = jwt.decode(token) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000).toISOString();

    console.log("[auth] debug_login: development test user");

    res.json({
      token,
      expiresAt,
      user: {
        id: adminId,
        firstName: "Dev",
        lastName: "Admin",
        username: "admin",
      },
    });
  } catch (error) {
    console.error("[auth] Error in debug auth:", error);
    res.status(500).json({ error: "Debug authentication failed" });
  }
});

export default router;
