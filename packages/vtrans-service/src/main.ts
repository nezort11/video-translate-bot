import type { Http } from "@yandex-cloud/function-types/dist/src/http";
import type Context from "@yandex-cloud/function-types/dist/src/context";
import { translateVideo, TranslateInProgressException } from "./vtrans";

// Logic to parse the incoming JSON payload and call translateVideo
export const handler = async (event: Http.Event, context: Context) => {
  try {
    // Check if body is a string (JSON) or object
    let body = event.body;
    if (event.isBase64Encoded) {
      body = Buffer.from(event.body, "base64").toString("utf-8");
    }

    // Parse body if it's a string
    let payload: any;
    if (typeof body === "string") {
      if (!body || body.trim() === "") {
        console.log("Empty body received");
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Empty request body" }),
        };
      }
      try {
        payload = JSON.parse(body);
      } catch (e) {
        console.error("Failed to parse JSON body:", body);
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid JSON" }),
        };
      }
    } else {
      payload = body;
    }

    console.log("Incoming request payload:", JSON.stringify(payload, null, 2));
    const {
      url,
      forceRegular,
      sourceLanguage,
      targetLanguage,
      videoFileUrl,
      subtitlesFileUrl,
      firstRequest,
      forceLively,
    } = payload;

    const result = await translateVideo(url, {
      sourceLanguage,
      targetLanguage,
      videoFileUrl,
      subtitlesFileUrl,
      useLivelyVoice: forceLively ?? !forceRegular,
      firstRequest,
    });

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    if (error instanceof TranslateInProgressException) {
      return {
        statusCode: 202,
        body: JSON.stringify(error.data),
      };
    }

    console.error("Handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || "Internal Server Error",
        data: error.data,
      }),
    };
  }
};
