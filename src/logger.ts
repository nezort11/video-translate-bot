import pino from "pino";
import { APP_ENV } from "./env";
// import { inspect } from "util";
import { formatAxiosError } from "./utils";

const transport =
  APP_ENV === "local"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "SYS:standard",
        },
      }
    : undefined;

export const logger = pino({
  transport,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  hooks: {
    logMethod(inputArgs, method, level) {
      if (inputArgs.length >= 1) {
        const arg = inputArgs[0];
        // Handle AxiosError
        if (
          arg &&
          typeof arg === "object" &&
          "isAxiosError" in arg &&
          (arg as any).isAxiosError === true
        ) {
          const formattedError = formatAxiosError(arg as any, {
            includeStack: false,
            separator: "\n  ",
          });
          return method.apply(this, [formattedError, ...inputArgs.slice(1)]);
        }
      }
      return method.apply(this, inputArgs as [string, ...any[]]);
    },
  },
});
