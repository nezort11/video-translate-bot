// import pino from "pino";
import { inspect } from "util";

// export const logger = pino({
//   transport: {
//     target: "pino-pretty",
//   },
// });

// Custom logger that limits depth when logging errors
const formatArg = (arg: unknown) => {
  if (arg instanceof Error || (typeof arg === "object" && arg !== null)) {
    return inspect(arg, {
      depth: 3,
      maxArrayLength: 10,
      maxStringLength: 300,
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
