import { Response } from "express";
import type { ErrorObject } from "serialize-error";
import { DEBUG_ENV } from "./env";
import moment from "moment";
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
  return moment.utc(seconds * 1000).format("H:mm:ss");
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
 * Serialize and escape error for safe display in HTML
 * @param error The error object to serialize
 * @returns HTML-escaped error string
 */
export const serializeAndEscapeError = (error: unknown): string => {
  const errorInspect = inspect(error, {
    depth: 2,
    maxArrayLength: 10,
    maxStringLength: 200,
    breakLength: 80,
    compact: true,
  });
  return escapeHtml(errorInspect);
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
