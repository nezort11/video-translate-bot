type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

/**
 * Enhanced formatter for log arguments.
 */
function formatArgs(args: unknown[]): {
  message: string;
  context?: Record<string, unknown>;
} {
  if (args.length === 0) return { message: "" };

  let context: Record<string, unknown> | undefined;
  let messageArgs = args;

  if (
    typeof args[0] === "object" &&
    args[0] !== null &&
    !Array.isArray(args[0]) &&
    !(args[0] instanceof Error)
  ) {
    context = args[0] as Record<string, unknown>;
    messageArgs = args.slice(1);
  }

  const message = messageArgs
    .map((a) => {
      if (a instanceof Error) {
        return `${a.name}: ${a.message}\n${a.stack}`;
      }
      if (typeof a === "object") {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");

  return { message, context };
}

/**
 * Standardized log writing logic.
 */
function writeLog(level: LogLevel, args: unknown[]): void {
  const { message, context } = formatArgs(args);
  const appEnv = process.env.APP_ENV ?? "local";
  const isLocal = appEnv === "local";

  if (isLocal) {
    const consoleFn =
      level === "ERROR" || level === "FATAL"
        ? console.error
        : level === "WARN"
          ? console.warn
          : level === "DEBUG" || level === "TRACE"
            ? console.debug
            : console.log;

    const timestamp = new Date().toLocaleTimeString();
    consoleFn(`[${timestamp}] [${level}]`, message, context || "");
    return;
  }

  // Production: Yandex Cloud Structured Logging
  // Requirements:
  // 1. Logs must be written to stdout (console.log) or stderr (console.error).
  // 2. To be parsed as structured logs, they must be a single-line JSON.
  // 3. 'message' (or 'msg') is the primary field for the log text.
  // 4. 'level' defines the severity (TRACE, DEBUG, INFO, WARN, ERROR, FATAL).
  //
  // Reference: https://yandex.cloud/en/docs/functions/operations/function/logs-write
  // Reference: https://yandex.cloud/en/docs/functions/concepts/logs#structured-logs
  const entry: Record<string, unknown> = {
    message,
    msg: message, // Support both common naming conventions (msg is often used by pino/winston)
    level,
    time: new Date().toISOString(),
    ...context,
  };

  const line = JSON.stringify(entry);

  if (level === "ERROR" || level === "FATAL") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  trace: (...args: unknown[]) => writeLog("TRACE", args),
  debug: (...args: unknown[]) => writeLog("DEBUG", args),
  info: (...args: unknown[]) => writeLog("INFO", args),
  warn: (...args: unknown[]) => writeLog("WARN", args),
  error: (...args: unknown[]) => writeLog("ERROR", args),
  fatal: (...args: unknown[]) => writeLog("FATAL", args),
};
