// import pino from "pino";
import { inspect } from "util";
import { formatAxiosError } from "./utils";

// export const logger = pino({
//   transport: {
//     target: "pino-pretty",
//   },
// });

// Custom logger that limits depth when logging errors
const formatArg = (arg: unknown) => {
  // Handle AxiosError specially to avoid massive logs
  if (
    arg &&
    typeof arg === "object" &&
    "isAxiosError" in arg &&
    (arg as any).isAxiosError === true
  ) {
    return formatAxiosError(arg, {
      includeStack: false,
      separator: "\n  ",
    });
  }

  // Handle regular errors
  if (arg instanceof Error) {
    const errorStr = `${arg.name}: ${arg.message}`;
    if (arg.stack) {
      const stackLines = arg.stack.split("\n").slice(0, 5);
      return `${errorStr}\n${stackLines.join("\n")}`;
    }
    return errorStr;
  }

  // Handle other objects with limited depth
  if (typeof arg === "object" && arg !== null) {
    return inspect(arg, {
      depth: 1,
      maxArrayLength: 10,
      maxStringLength: 200,
      breakLength: 120,
      compact: true,
    });
  }

  return arg;
};

export const logger = {
  log: (...args: unknown[]) => console.log(...args.map(formatArg)),
  info: (...args: unknown[]) => console.info(...args.map(formatArg)),
  warn: (...args: unknown[]) => console.warn(...args.map(formatArg)),
  error: (...args: unknown[]) => console.error(...args.map(formatArg)),
  debug: (...args: unknown[]) => console.debug(...args.map(formatArg)),
};
