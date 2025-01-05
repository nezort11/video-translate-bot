// import http from "http";
// import http2 from "serverless-http";
import express from "express";
// import { fileURLToPath } from "url";
// import storage from "node-persist";
import { bot } from "./bot";
// import { app } from "./app";
import { logger } from "./logger";
import { setIsPublic, NODE_ENV, DEBUG, BOT_PUBLIC_USERNAME, PORT } from "./env";
// import { telegramLoggerContext } from "./telegramlogger";

// export const handler = http2(bot.webhookCallback("/webhook"));

// export const appHandler = http(app);

// Global error handlers
//
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("warning", (warning) => {
  console.warn("Warning:", warning.name, warning.message, warning.stack);
});

const main = async () => {
  logger.info(`VERSION: ${process.version}`);
  logger.info(`DEBUG: ${DEBUG}`);

  // await storage.init({ dir: "./session/storage" });

  bot.launch();
  const botInfo = await bot.telegram.getMe();
  setIsPublic(botInfo.username === BOT_PUBLIC_USERNAME);
  logger.info(`🚀 Started bot server on https://t.me/${botInfo.username}`);
  try {
    // await telegramLoggerContext.reply(`🚀 Started bot server`);
  } catch (error) {
    console.warn(error);
  }
};

// const server = http.createServer(handler);

const app = express();

app.use(bot.webhookCallback("/webhook"));

// if (process.argv[1] === fileURLToPath(import.meta.url)) {
if (require.main === module) {
  // main();
  app.listen(PORT, () => {
    console.log(`🚀 Server is listening on port ${PORT}`);
  });
}
