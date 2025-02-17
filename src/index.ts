// Load variables from env file before start
import {
  setIsPublic,
  NODE_ENV,
  DEBUG,
  BOT_PUBLIC_USERNAME,
  PORT,
  BOT_TOKEN,
  APP_ENV,
} from "./env";

// import http from "http";
// import http2 from "serverless-http";
import express, { Request } from "express";
// import { fileURLToPath } from "url";
// import storage from "node-persist";
import { bot } from "./bot";
import { app } from "./app";
import { logger } from "./logger";

import { Telegraf } from "telegraf";
import moment from "moment";
import { inspect } from "util";

// import { telegramLoggerContext } from "./telegramlogger";

// export const handler = http2(bot.webhookCallback("/webhook"));

// export const appHandler = http(app);

const handler = express();

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

const debugBot = new Telegraf(BOT_TOKEN, {
  // REQUIRED for `sendChatAction` to work in serverless/webhook environment https://github.com/telegraf/telegraf/issues/1047
  telegram: { webhookReply: false },
  handlerTimeout: moment.duration(1, "hour").asMilliseconds(),
});

debugBot.start(async (context) => await context.reply("Hi, lol"));

debugBot.command("debug_timeout", async (context) => {
  // pending promise
  await new Promise((resolve, reject) => {
    setInterval(() => {
      logger.info(`Debug timeout ${new Date().toLocaleString()}`);
    }, 5000);
  });
});

// app.use(debugBot.webhookCallback("/webhook"));

interface EventMetadata {
  event_id: string;
  event_type: string;
  created_at: string;
  tracing_context: null | Record<string, unknown>;
  cloud_id: string;
  folder_id: string;
}

interface Message {
  message_id: string;
  md5_of_body: string;
  body: string;
  attributes: {
    ApproximateFirstReceiveTimestamp: string;
    ApproximateReceiveCount: string;
    SenderId: string;
    SentTimestamp: string;
  };
  message_attributes: Record<string, string>;
  md5_of_message_attributes: string;
}

interface QueueMessage {
  queue_id: string;
  message: Message;
}

interface YandexQueueEvent {
  event_metadata: EventMetadata;
  messages: QueueMessage[];
}

// if (process.argv[1] === fileURLToPath(import.meta.url)) {
if (require.main === module) {
  // Start long polling server locally and webhook handler on the server
  if (APP_ENV === "local") {
    main();
  } else {
    handler.use(bot.webhookCallback("/webhook"));

    const QUEUE_WEBHOOK_PATH = "/queue/callback";
    // webhook callback called by trigger from message queue
    handler.post(
      QUEUE_WEBHOOK_PATH,
      async (req: Request<{}, {}, YandexQueueEvent>, res) => {
        console.log(
          "queue webhook incoming request body",
          typeof req.body,
          req.body
        );
        const messages = req.body.messages;
        console.log("queue webhook messages received", messages);
        // only handle single message from queue. adjust according to trigger `batch_size`
        const message = messages[0];
        const updateBody = message.message.body;

        // Proxy all queue request as update requests to webhook handler
        await bot.webhookCallback(QUEUE_WEBHOOK_PATH)(
          {
            ...req,
            // Replace queue request body with telegram update body
            // @ts-expect-error body can be object, buffer or string
            body: updateBody,
          },
          res
        );
      }
    );
  }

  handler.use(app);

  // fallback middleware to debug all other requests
  handler.use(async (req, res) => {
    console.log("received fallen request url", req.url);
    console.log(
      "received fallen request body",
      inspect(req.body, undefined, 5)
    );
    console.log("received fallen request headers", req.headers);

    res.sendStatus(200);
  });

  handler.listen(PORT, () => {
    console.log(`🚀 Started express server on port ${PORT}`);
  });
}
