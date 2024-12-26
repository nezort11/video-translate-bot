import express from "express";
import { bot } from "./bot";

const app = express();

// Set the bot API endpoint
// app.use(await bot.webhookCallback());

app.listen(process.env.PORT, () =>
  console.log("Listening on port", process.env.PORT)
);
