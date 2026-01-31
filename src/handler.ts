import express from "express";
import { bot } from "./bot";
import { logger } from "./logger";

const app = express();

// Set the bot API endpoint
// app.use(await bot.webhookCallback());

app.listen(process.env.PORT, () =>
  logger.info("Listening on port", process.env.PORT)
);
