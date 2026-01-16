import express, { Application } from "express";
import cors from "cors";

import authRoutes from "./routes/auth";
import metricsRoutes from "./routes/metrics";
import usersRoutes from "./routes/users";

export const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());
// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  if (req.headers.authorization) {
    console.log(`  Auth: Bearer ${req.headers.authorization.slice(7, 20)}...`);
  }
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/users", usersRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("[admin-api] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);
