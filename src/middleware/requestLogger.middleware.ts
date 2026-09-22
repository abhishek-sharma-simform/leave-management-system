import { pinoHttp } from "pino-http";
import { logger } from "../config/logger.ts";

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const id = crypto.randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
});
