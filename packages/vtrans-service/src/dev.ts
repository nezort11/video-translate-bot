import dotenv from "dotenv";
import path from "path";

// Load .env from package root
dotenv.config({ path: path.join(__dirname, "../.env") });

import http from "http";

import { handler } from "./main";
import type { Http } from "@yandex-cloud/function-types/dist/src/http";
import type Context from "@yandex-cloud/function-types/dist/src/context";

const PORT = 3000;

const server = http.createServer(async (req, res) => {
  try {
    const buffers: any[] = [];

    for await (const chunk of req) {
      buffers.push(chunk);
    }

    const bodyBuffer = Buffer.concat(buffers);
    const body = bodyBuffer.toString("utf-8");

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    // Mock Yandex Cloud Function Event
    const event: Http.Event = {
      httpMethod: (req.method as any) ?? "GET",
      headers: req.headers as Record<string, string>,
      multiValueHeaders: {}, // Simplified for dev
      queryStringParameters: queryParams,
      multiValueQueryStringParameters: {}, // Simplified for dev
      body: body,
      isBase64Encoded: false,
      requestContext: {
        identity: {
          sourceIp: "127.0.0.1",
          userAgent: "dev-server",
        },
        httpMethod: (req.method as any) ?? "GET",
        requestId: "dev-request-id",
        requestTime: new Date().toISOString(),
        requestTimeEpoch: Date.now(),
      },
    };

    // Mock Context
    const context: Context = {
      requestId: "local-dev-request",
      functionName: "local-dev-function",
      functionVersion: "1.0.0",
      memoryLimitInMB: "128",
      token: {
        access_token: "",
        expires_in: 0,
        token_type: "",
      },
      getRemainingTimeInMillis: () => 30000,
      getPayload: () => ({}), // Mock getPayload
    };

    console.log(`[DevServer] Processing ${req.method} ${req.url}`);

    const result = await handler(event, context);

    if (result) {
      res.statusCode = result.statusCode;
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          if (value) res.setHeader(key, value);
        });
      }
      res.end(result.body);
    } else {
      res.statusCode = 200;
      res.end();
    }
  } catch (error) {
    console.error("[DevServer] Error:", error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Internal Server Error" }));
  }
});

server.listen(PORT, () => {
  console.log(`Dev server running on http://localhost:${PORT}`);
});
