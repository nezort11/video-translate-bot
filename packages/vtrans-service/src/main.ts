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
    const payload = typeof body === "string" ? JSON.parse(body) : body;
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

    if (!url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing url parameter" }),
      };
    }

    console.log(
      `Processing translation for ${url}, forceRegular=${forceRegular}, firstRequest=${firstRequest}`
    );

    let result;
    if (forceRegular) {
      result = await translateVideo(url, {
        useLivelyVoice: false,
        sourceLanguage,
        targetLanguage,
        videoFileUrl,
        subtitlesFileUrl,
        firstRequest,
      });
    } else {
      // Prefer live voices (default)
      try {
        result = await translateVideo(url, {
          useLivelyVoice: true,
          sourceLanguage,
          targetLanguage,
          videoFileUrl,
          subtitlesFileUrl,
          firstRequest,
        });
      } catch (error) {
        if (error instanceof TranslateInProgressException) {
          // If in progress, return the status (code 202 could be appropriate, but returning JSON with status works too)
          // Returning success with status info so client can poll
          return {
            statusCode: 200, // Returning 200 to indicate valid response from Yandex (even if it says "Waiting")
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(error.data, null, 2),
          };
        }
        if (forceLively) {
          console.log(
            "Live voice failed, but forceLively is true, not falling back"
          );
          throw error;
        }

        // Fallback to regular
        console.log("Live voice failed, falling back to regular");
        result = await translateVideo(url, {
          useLivelyVoice: false,
          sourceLanguage,
          targetLanguage,
          videoFileUrl,
          subtitlesFileUrl,
          firstRequest,
        });
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result, null, 2),
    };
  } catch (error: any) {
    console.error("Handler error:", error);
    if (error instanceof TranslateInProgressException) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(error.data, null, 2),
      };
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        { message: error.message, stack: error.stack },
        null,
        2
      ),
    };
  }
};
