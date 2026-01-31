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

// Suppress NODE_TLS_REJECT_UNAUTHORIZED warning before imports
const originalEmit = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  if (
    typeof warning === "string" &&
    warning.includes("NODE_TLS_REJECT_UNAUTHORIZED")
  ) {
    return; // suppress this warning
  }
  return originalEmit.call(process, warning, ...args);
};

// import http from "http";
import * as http from "http";
// Package subpath './src/core/network/webhook' is not defined by "exports" in /function/code/node_modules/telegraf/package.json
// import generateWebhook from "telegraf/src/core/network/webhook";
import serverlessHttp from "serverless-http";
import express, { Request } from "express";
// import { fileURLToPath } from "url";
// import storage from "node-persist";
import { bot } from "./bot";
import { app } from "./app";
import { logger } from "./logger";

import { Telegraf } from "telegraf";
import { duration } from "./time";
import type { Handler } from "@yandex-cloud/function-types";
// import type { MessageQueue } from "@yandex-cloud/function-types/dist/src/triggers/messageQueue";
import type { Http } from "@yandex-cloud/function-types/dist/src/http";
import type { MessageQueue } from "@yandex-cloud/function-types/dist/src/triggers/";
import { inspect } from "util";
import { Update } from "telegraf/types";
import { handleInternalErrorExpress } from "./utils";

// import { telegramLoggerContext } from "./telegramlogger";

import d from "debug";
// import { type Update } from "../types/typegram";
const debug = d("telegraf:webhook");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// copy pasted from telegraf/src/core/network/webhook.ts
export default function generateWebhook(
  filter: (req: http.IncomingMessage) => boolean,
  updateHandler: (update: Update, res: http.ServerResponse) => Promise<void>
) {
  return async (
    req: http.IncomingMessage & { body?: Update },
    res: http.ServerResponse,
    next = (): void => {
      res.statusCode = 403;
      debug("Replying with status code", res.statusCode);
      res.end();
    }
  ): Promise<void> => {
    debug("Incoming request", req.method, req.url);

    if (!filter(req)) {
      debug("Webhook filter failed", req.method, req.url);
      return next();
    }

    let update: Update;

    try {
      if (req.body != null) {
        /* If req.body is already set, we expect it to be the parsed
         request body (update object) received from Telegram
         However, some libraries such as `serverless-http` set req.body to the
         raw buffer, so we'll handle that additionally */

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let body: any = req.body;
        // if body is Buffer, parse it into string
        if (body instanceof Buffer) body = String(req.body);
        // if body is string, parse it into object
        if (typeof body === "string") body = JSON.parse(body);
        update = body;
      } else {
        let body = "";
        // parse each buffer to string and append to body
        for await (const chunk of req) body += String(chunk);
        // parse body to object
        update = JSON.parse(body);
      }
    } catch (error: unknown) {
      debug("Failed to parse request body:", error);
      // if any of the parsing steps fails, give up and respond with error
      // res.writeHead(415).end();
      res.statusCode = 415;
      res.end();
      return;
    }

    return await updateHandler(update, res);
  };
}

// export const handler = http(bot.webhookCallback("/webhook"));
export const handler: Handler.MessageQueue = (event, context) => {
  const queueMessage = event.messages[0];
  const queueEvent = queueMessage.details.message;
  // Transform the original message queue event object to event to lambda-compatible http event object
  const lambdaEvent: Http.Event = {
    ...queueEvent,
    httpMethod: "POST",
    headers: {},
    queryStringParameters: {},
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: {},
    requestContext: {
      ...context,
      httpMethod: "POST",
      requestTime: queueMessage.event_metadata.created_at,
      requestTimeEpoch: 0,
      identity: {
        sourceIp: "",
        userAgent: "",
      },
    },
  };

  const serverlessHttpHandler = serverlessHttp(
    generateWebhook(
      // disable all request filters
      () => true,
      (update: Update, res: http.ServerResponse) =>
        bot.handleUpdate(update, res)
    ),
    {
      provider: "aws",
    }
  );

  return serverlessHttpHandler(lambdaEvent, context);
};

// export const appHandler = http(app);

const handlerApp = express();
handlerApp.use(express.json());

// Global error handlers
//
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("warning", (warning) => {
  logger.warn("Warning:", warning.name, warning.message, warning.stack);
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
    logger.warn(error);
  }
};

// const server = http.createServer(handler);

const debugBot = new Telegraf(BOT_TOKEN, {
  // REQUIRED for `sendChatAction` to work in serverless/webhook environment https://github.com/telegraf/telegraf/issues/1047
  telegram: { webhookReply: false },
  handlerTimeout: duration.hours(1),
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
  cloud_id: string;
  folder_id: string;
  tracing_context?: Record<string, unknown> | null;
}

interface MessageAttributes {
  data_type: string;
  string_value?: string;
}

interface Message {
  message_id: string;
  md5_of_body: string;
  body: string;
  attributes: {
    SentTimestamp: string;
    ApproximateFirstReceiveTimestamp?: string;
    ApproximateReceiveCount?: string;
    SenderId?: string;
  };
  message_attributes: Record<string, MessageAttributes>;
  md5_of_message_attributes: string;
}

interface QueueMessageDetails {
  queue_id: string;
  message: Message;
}

interface YandexQueueEvent {
  event_metadata: EventMetadata;
  details: QueueMessageDetails;
}

interface YandexQueueRequest {
  messages: YandexQueueEvent[];
}

// if (process.argv[1] === fileURLToPath(import.meta.url)) {
if (require.main === module) {
  // Start long polling server locally and webhook handler on the server
  if (APP_ENV === "local") {
    main();
  } else {
    handlerApp.use(bot.webhookCallback("/webhook"));

    // adjust according to trigger container path
    const QUEUE_WEBHOOK_PATH = "/queue/callback";
    // webhook callback called by trigger from message queue
    handlerApp.post(
      QUEUE_WEBHOOK_PATH,
      async (req: Request<{}, {}, MessageQueue.Event>, res) => {
        try {
          logger.info(
            "queue webhook incoming request body",
            typeof req,
            typeof req.body,
            req.body
          );
          const messages = req.body.messages;
          logger.info("queue webhook messages received", messages);
          // only handle single message from queue. adjust according to trigger `batch_size`
          const message = messages[0];

          const updateBody = message.details.message.body;
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
        } catch (error) {
          await handleInternalErrorExpress(error, res);
        }
      }
    );
  }

  handlerApp.use(app);

  // fallback middleware to debug all other requests
  handlerApp.use(async (req, res) => {
    logger.info("received fallen request url", req.method, req.url);
    logger.info(
      "received fallen request body",
      inspect(req.body, undefined, 5)
    );
    logger.info("received fallen request headers", req.headers);

    res.sendStatus(200);
  });

  handlerApp.listen(PORT, () => {
    logger.info(`🚀 Started express server on port ${PORT}`);
  });
}
