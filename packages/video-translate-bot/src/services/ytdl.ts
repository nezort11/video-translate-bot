import axios, { AxiosError } from "axios";
// import ytdl, { downloadOptions } from "@distube/ytdl-core";
import { logger } from "../logger";
import { YTDL_API_BASE_URL, YTDL_API_SECRET, YTDL_FUNCTION_URL } from "../env";

/**
 * Error thrown when ytdl download fails due to temporary issues
 * (e.g., YouTube blocking, empty file, format issues).
 * This error should trigger a user-friendly message and admin alert.
 */
export class YtdlDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YtdlDownloadError";
  }
}

/**
 * Error thrown when the external YTDL service is unavailable or returns an error.
 */
export class YtdlServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YtdlServiceError";
  }
}

// https://github.com/distubejs/ytdl-core#rate-limiting

const ytdlClient = axios.create({
  baseURL: YTDL_API_BASE_URL,
  headers: YTDL_API_SECRET ? { "X-API-Key": YTDL_API_SECRET } : {},
  // validateStatus: (status) => status < 500, // Don't throw on 4xx errors
});

// Validate ytdl client configuration at startup
if (!YTDL_API_BASE_URL) {
  logger.warn(
    "YTDL_API_BASE_URL is not configured. YTDL video info requests will fail."
  );
}

export const getVideoInfoYtdl = async (url: string) => {
  try {
    const videoInfoResponse = await ytdlClient.get("/info", {
      params: { url },
    });
    return videoInfoResponse.data;
  } catch (error) {
    logger.error("Failed to get video info from ytdl service", error);
    throw new YtdlServiceError("Failed to get video info");
  }
};

type VideoDownloadResponseData = {
  url: string;
};

type VideoDownloadUrlResponseData = {
  url: string;
  format_id: string;
  ext: string;
  quality?: string;
  filesize?: number;
  expires_in_hours: number;
  title?: string;
  duration?: number;
};

/**
 * Downloads video through direct function invocation (bypasses API Gateway).
 * Has 10-minute timeout instead of API Gateway's 5-minute limit.
 */
export const downloadVideo = async (url: string, format?: string | number) => {
  // Use direct function invocation to bypass API Gateway's 5-minute timeout
  // Function has 10-minute timeout which is enough for large videos
  let functionUrl = YTDL_FUNCTION_URL || YTDL_API_BASE_URL;

  if (!functionUrl) {
    throw new Error(
      "YTDL service is not configured. Please set YTDL_FUNCTION_URL or YTDL_API_BASE_URL environment variable."
    );
  }

  // If using local/mock service (base url instead of actual cloud function url), append /download
  if (!YTDL_FUNCTION_URL && functionUrl === YTDL_API_BASE_URL) {
    functionUrl = functionUrl.endsWith("/")
      ? functionUrl + "download"
      : functionUrl + "/download";
  }

  try {
    const videoDownloadResponse = await axios.post<VideoDownloadResponseData>(
      functionUrl,
      {
        url,
        ...(format && { format: format.toString() }),
      },
      {
        headers: YTDL_API_SECRET ? { "X-API-Key": YTDL_API_SECRET } : {},
        timeout: 600000, // 10 minutes
      }
    );

    return videoDownloadResponse.data.url;
  } catch (error) {
    // Check if this is a VIDEO_DOWNLOAD_EMPTY error from the ytdl service
    if (error instanceof AxiosError && error.response?.data) {
      const responseData = error.response.data as {
        error?: string;
        message?: string;
      };

      if (responseData.error === "VIDEO_DOWNLOAD_EMPTY") {
        logger.warn(
          "Video download failed due to empty file:",
          responseData.message
        );
        throw new YtdlDownloadError(
          responseData.message ||
            "Video download failed due to temporary platform issues"
        );
      }

      // Also check for the old error message format (before validation was added)
      if (
        typeof responseData.error === "string" &&
        responseData.error.includes("downloaded file is empty")
      ) {
        logger.warn(
          "Video download failed (legacy error format):",
          responseData.error
        );
        throw new YtdlDownloadError(
          "Video download failed due to temporary platform issues"
        );
      }
    }

    if (error instanceof YtdlDownloadError) {
      throw error;
    }

    logger.error("Failed to download video from ytdl service", error);
    throw new YtdlServiceError("Failed to download video");
  }
};

/**
 * Gets direct YouTube download URL without downloading through our gateway.
 * Avoids the 5-minute API Gateway timeout for large videos.
 *
 * @param url - YouTube video URL
 * @param format - Video format ID (e.g., "18" for 360p, "22" for 720p)
 * @returns Object containing direct download URL and video metadata
 *
 * Note: The returned URL expires after ~6 hours
 */
export const getVideoDownloadUrl = async (
  url: string,
  format?: string | number
): Promise<VideoDownloadUrlResponseData> => {
  try {
    const response = await ytdlClient.get<VideoDownloadUrlResponseData>(
      "/download-url",
      {
        params: {
          url,
          ...(format && { format: format.toString() }),
        },
      }
    );

    return response.data;
  } catch (error) {
    logger.error("Failed to get video download url from ytdl service", error);
    throw new YtdlServiceError("Failed to get video download url");
  }
};
