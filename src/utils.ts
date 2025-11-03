import { Response } from "express";
import type { ErrorObject } from "serialize-error";
import { DEBUG_ENV } from "./env";
import { formatDuration as formatDurationTime } from "./time";
import { inspect } from "util";

/**
 * Round a number to the specified precision (lodash round equivalent)
 * @param number The number to round
 * @param precision The number of decimal places (default: 0)
 */
export const round = (number: number, precision: number = 0): number => {
  const factor = Math.pow(10, precision);
  return Math.round(number * factor) / factor;
};

/**
 * Capitalize the first character of a string and lowercase the rest (lodash capitalize equivalent)
 */
export const capitalize = (string: string): string => {
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
};

export const getChatId = (id: string) => {
  return `-100${id}`;
};

export const formatDuration = (seconds: number) => {
  return formatDurationTime(seconds);
};

export const formatFileSize = (fileSize: number) => {
  return round(fileSize / 1024 / 1024, 2);
};

export const escapeHtml = (unsafeHtml: string) => {
  return unsafeHtml
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

// https://github.com/TypeStrong/ts-node/discussions/1290
export const dynamicImport = new Function(
  "specifier",
  "return import(specifier)"
) as <T>(module: string) => Promise<T>;

export const importPTimeout = async () =>
  await dynamicImport<typeof import("p-timeout")>("p-timeout");

export const importPRetry = async () =>
  await dynamicImport<typeof import("p-retry")>("p-retry");

export const importSerializeError = async () =>
  await dynamicImport<typeof import("serialize-error")>("serialize-error");

export const importNanoid = async () =>
  await dynamicImport<typeof import("nanoid")>("nanoid");

export const serializeErrorAsync = async (error: unknown) => {
  const { serializeError } = await importSerializeError();
  const serializedError = serializeError(error);
  // https://docs.pynt.io/documentation/api-security-testing/pynt-security-tests-coverage/stack-trace-in-response
  if (DEBUG_ENV !== "true") {
    delete serializedError.stack;
  }
  return serializedError;
};

export const handleInternalErrorExpress = async (
  error: unknown,
  res: Response<ErrorObject>
) => {
  const { logger } = await import("./logger");
  logger.error(error);
  const serializedError = await serializeErrorAsync(error);
  res.status(500).json(serializedError);
};

export const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout((_) => resolve(undefined), milliseconds));

export const percent = (percent: number) => percent / 100;

/**
 * Format an AxiosError for logging/display with only essential information.
 * Avoids deeply nested socket/TLS details that can create massive logs.
 * @param error The AxiosError to format
 * @param options Formatting options
 * @returns Formatted error string
 */
export const formatAxiosError = (
  error: any,
  options: {
    includeStack?: boolean;
    maxResponseLength?: number;
    separator?: string;
  } = {}
): string => {
  const {
    includeStack = false,
    maxResponseLength = 500,
    separator = "\n",
  } = options;

  const parts: string[] = [];

  // Error name and message
  if (error.name) {
    parts.push(`${error.name}: ${error.message || "Unknown error"}`);
  } else if (error.message) {
    parts.push(error.message);
  }

  // HTTP status and status text
  if (error.response?.status) {
    parts.push(
      `Status: ${error.response.status} ${error.response.statusText || ""}`
    );
  }

  // Request details
  if (error.config) {
    const method = error.config.method?.toUpperCase();
    const url = error.config.baseURL
      ? `${error.config.baseURL}${error.config.url || ""}`
      : error.config.url;
    if (method && url) {
      parts.push(`Request: ${method} ${url}`);
    }
  }

  // Response data (if it's small and useful)
  if (error.response?.data) {
    try {
      const dataStr =
        typeof error.response.data === "string"
          ? error.response.data
          : JSON.stringify(error.response.data);

      if (dataStr.length <= maxResponseLength) {
        parts.push(`Response: ${dataStr}`);
      } else {
        parts.push(
          `Response: ${dataStr.substring(0, maxResponseLength)}... (truncated)`
        );
      }
    } catch {
      parts.push("Response: [unable to serialize]");
    }
  }

  // Error code
  if (error.code) {
    parts.push(`Code: ${error.code}`);
  }

  // Stack trace (optional, first few lines only)
  if (includeStack && error.stack) {
    const stackLines = error.stack.split("\n").slice(0, 5);
    parts.push(`Stack:\n${stackLines.join("\n")}`);
  }

  return parts.join(separator);
};

/**
 * Serialize and escape error for safe display in HTML
 * @param error The error object to serialize
 * @returns HTML-escaped error string
 */
export const serializeAndEscapeError = (error: unknown): string => {
  let errorText: string;

  // Check if it's an AxiosError
  if (
    error &&
    typeof error === "object" &&
    "isAxiosError" in error &&
    error.isAxiosError === true
  ) {
    errorText = formatAxiosError(error, { includeStack: true });
  } else if (error instanceof Error) {
    // Regular Error object
    errorText = `${error.name}: ${error.message}`;
    if (error.stack) {
      const stackLines = error.stack.split("\n").slice(0, 5);
      errorText += `\n${stackLines.join("\n")}`;
    }
  } else {
    // Fallback to inspect with very limited depth
    errorText = inspect(error, {
      depth: 1,
      maxArrayLength: 5,
      maxStringLength: 100,
      breakLength: 80,
      compact: true,
    });
  }

  return escapeHtml(errorText);
};

/**
 * Truncate a string to fit within a maximum length,
 * intelligently preserving the beginning and truncating later content
 * @param text The text to truncate
 * @param maxLength Maximum character length for the output
 * @returns Truncated string
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  // Split into lines to preserve the error message and truncate stack trace
  const lines = text.split("\n");

  // Keep first few lines (usually contains the error type and message)
  const headerLineCount = Math.min(5, lines.length);
  const headerLines = lines.slice(0, headerLineCount).join("\n");

  // Calculate how much space we have left for remaining content
  const truncationMessage = "\n\n... (truncated)";
  const remainingSpace =
    maxLength - headerLines.length - truncationMessage.length;

  if (remainingSpace > 0 && lines.length > headerLineCount) {
    // Add as many additional lines as possible
    const remainingLines = lines.slice(headerLineCount);
    let additionalPart = "";

    for (const line of remainingLines) {
      if (additionalPart.length + line.length + 1 > remainingSpace) {
        break;
      }
      additionalPart += "\n" + line;
    }

    return headerLines + additionalPart + truncationMessage;
  } else {
    // Just truncate the header if even that's too long
    const availableSpace = maxLength - truncationMessage.length;
    return headerLines.substring(0, availableSpace) + truncationMessage;
  }
};
