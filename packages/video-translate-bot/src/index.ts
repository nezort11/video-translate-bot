// Load variables from env file before start
import {
  setIsPublic,
  DEBUG,
  BOT_PUBLIC_USERNAME,
  PORT,
  BOT_TOKEN,
  BOT_TOKEN_PROD,
  APP_ENV,
  getProxyAgent,
  PROXY_SERVER_URI,
  ROOT_DIR_PATH,
  WEBHOOK_SECRET_TOKEN,
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
import * as https from "https";
import fs from "fs";
import path from "path";
// Package subpath './src/core/network/webhook' is not defined by "exports" in /function/code/node_modules/telegraf/package.json
// import generateWebhook from "telegraf/src/core/network/webhook";
// NOTE: serverless-http is used as a shim library to bridge Cloud Function events to Express/Telegraf handlers.
// It is NOT related to the Serverless Framework which has been removed.
import serverlessHttp from "serverless-http";
import express, { Request } from "express";
// import { fileURLToPath } from "url";
// import storage from "node-persist";
import { bot } from "./bot";
import { app } from "./app";
import { logger } from "./logger";

import { Telegraf } from "telegraf";
import { duration } from "./time";
// import type { MessageQueue } from "@yandex-cloud/function-types/dist/src/triggers/messageQueue";
import type { Http } from "@yandex-cloud/function-types/dist/src/http";
import type { MessageQueue } from "@yandex-cloud/function-types/dist/src/triggers/";
import type YandexContext from "@yandex-cloud/function-types/dist/src/context";
import { inspect } from "util";
import { Update } from "telegraf/types";
import { Context } from "aws-lambda";

/**
 * Extended Yandex Cloud HTTP Event with missing 'path' property
 */
interface YandexHttpEvent extends Http.Event {
  path: string;
}

type HandledEvent = MessageQueue.Event | YandexHttpEvent;
import { MetricsService } from "./services/metrics";
import { setGlobalMetricsService } from "./services/metricsglobal";
import { handleInternalErrorExpress, getPublicIP } from "./utils";
import { initUpdatesTable } from "./db";

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
export const handler = async (
  event: HandledEvent,
  context: Context & YandexContext
) => {
  // Extract IAM token from context
  const iamToken = context.token?.access_token;
  if (iamToken) {
    logger.info("IAM token found in context");
    setGlobalMetricsService(new MetricsService(iamToken));
  } else {
    // Local dev or missing token
    logger.warn("No IAM token found in context");
  }

  // Handle HTTP Ping Request
  if ("httpMethod" in event && event.httpMethod === "GET") {
    if (event.path === "/ping") {
      logger.info("pong");
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/plain" },
        body: "pong",
      };
    }
  }

  // logger.info({ event, context }, "handler");
  logger.info("handler");

  if (!("messages" in event)) {
    logger.warn("Unknown event type or missing messages", event);
    return { statusCode: 400, body: "Unknown event" };
  }

  const queueEventMessage = event;
  const queueMessage = queueEventMessage.messages[0];
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
      requestId: context.requestId,
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

// if (process.argv[1] === fileURLToPath(import.meta.url)) {
if (require.main === module) {
  // Initialize database schema
  initUpdatesTable().catch((err) => {
    logger.error("Failed to initialize database:", err);
  });

  const isPolling = process.env.BOT_POLLING === "true";

  if (isPolling) {
    logger.info("Starting bot in POLLING mode...");
    bot.launch({
      dropPendingUpdates: true,
    });

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } else {
    logger.info("Starting bot in WEBHOOK mode...");

    // Use a provided secret token or generate a random one for this session if not provided
    const secretToken =
      WEBHOOK_SECRET_TOKEN || require("crypto").randomBytes(32).toString("hex");

    if (!WEBHOOK_SECRET_TOKEN) {
      logger.warn(
        "WEBHOOK_SECRET_TOKEN is not set. A random token has been generated for this session."
      );
    }

    handlerApp.use(bot.webhookCallback("/webhook", { secretToken }));

    // Set webhook automatically on startup
    const setupWebhook = async () => {
      try {
        const ip = await getPublicIP();
        // Bot API supports ports 443, 80, 88, 8443
        const portNumber = Number(PORT);
        const isSupportedPort = [80, 443, 88, 8443].includes(portNumber);
        const portSuffix = isSupportedPort
          ? portNumber === 443
            ? ""
            : `:${portNumber}`
          : `:${portNumber}`; // Still add it, but it might fail if not in supported list

        const webhookUrl = `https://${ip}${portSuffix}/webhook`;

        const certPath = path.resolve(ROOT_DIR_PATH, "certificates/cert.pem");
        const hasCert = fs.existsSync(certPath);

        logger.info(
          `Setting webhook to ${webhookUrl}... (PORT: ${PORT}, hasCert: ${hasCert}, hasSecret: ${!!secretToken})`
        );
        await bot.telegram.setWebhook(webhookUrl, {
          drop_pending_updates: true,
          certificate: hasCert ? { source: certPath } : undefined,
          secret_token: secretToken,
        });

        const info = await bot.telegram.getWebhookInfo();
        logger.info("Webhook info:", info);

        if (!isSupportedPort) {
          logger.warn(
            `Port ${PORT} is not officially supported by Telegram Bot API webhooks. Supported ports: 443, 80, 88, 8443.`
          );
        }
      } catch (error) {
        logger.error("Failed to set webhook:", error);
      }
    };
    setupWebhook();
  }

  const QUEUE_WEBHOOK_PATH = "/queue/callback";

  // webhook callback called by trigger from message queue
  handlerApp.post(
    QUEUE_WEBHOOK_PATH,
    async (req: Request<object, object, MessageQueue.Event>, res) => {
      try {
        const messages = req.body.messages;
        const message = messages[0];
        const updateBody = message.details.message.body;
        const update =
          typeof updateBody === "string"
            ? JSON.parse(updateBody)
            : updateBody;

        logger.info("queue webhook incoming request", {
          update_id: update?.update_id,
          message_id: (message.event_metadata as any)?.message_id,
          path: QUEUE_WEBHOOK_PATH,
        });

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
        logger.error("Error in queue webhook handler:", error);
        await handleInternalErrorExpress(error, res);
      }
    }
  );

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

  const keyPath = path.resolve(ROOT_DIR_PATH, "certificates/key.pem");
  const certPath = path.resolve(ROOT_DIR_PATH, "certificates/cert.pem");

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const options = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    https.createServer(options, handlerApp).listen(PORT, () => {
      logger.info(`🚀 Started HTTPS express server on port ${PORT}`);
    });
  } else {
    handlerApp.listen(PORT, () => {
      logger.info(`🚀 Started express server on port ${PORT}`);
    });
  }
}
