import pino from "pino";
import { APP_ENV } from "./env";
import { formatAxiosError } from "./utils";

const isLocal = APP_ENV === "local";

/**
 * Production logger that uses console.log to ensure logs are captured by Yandex Cloud Functions
 * but formats multiple arguments correctly so data is not lost.
 */
const prodLog = (level: string, ...args: any[]) => {
  let logObj: any = {
    level,
    timestamp: new Date().toISOString(),
  };

  if (args.length === 0) return;

  // Handle first argument if it's an object (context/metadata)
  if (
    typeof args[0] === "object" &&
    args[0] !== null &&
    !Array.isArray(args[0])
  ) {
    Object.assign(logObj, args[0]);
    if (args.length > 1) {
      logObj.msg = args
        .slice(1)
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" ");
    }
  } else {
    // Join all arguments as a message string
    logObj.msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
  }

  // Print as a single JSON line
  console.log(JSON.stringify(logObj));
};

export const logger = isLocal
  ? pino({
      level: process.env.LOG_LEVEL || "debug",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "SYS:standard",
        },
      },
    })
  : ({
      info: (...args: any[]) => prodLog("INFO", ...args),
      error: (...args: any[]) => prodLog("ERROR", ...args),
      warn: (...args: any[]) => prodLog("WARN", ...args),
      debug: (...args: any[]) => prodLog("DEBUG", ...args),
      trace: (...args: any[]) => prodLog("TRACE", ...args),
    } as any);
