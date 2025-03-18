import { Response } from "express";
import type { ErrorObject } from "serialize-error";
import { DEBUG_ENV } from "./env";
import moment from "moment";

export const getChatId = (id: string) => {
  return `-100${id}`;
};

export const formatDuration = (seconds: number) => {
  return moment.utc(seconds * 1000).format("H:mm:ss");
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
  console.log("serialized error", serializedError);
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
  console.error(error);
  const serializedError = await serializeErrorAsync(error);
  res.status(500).json(serializedError);
};
