import pino from "pino";
import { LOG_LEVEL, NODE_ENV } from "./env.ts";

export const logger = pino({
  level: LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
  },
  transport:
    NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: { colorize: true },
        },
});
