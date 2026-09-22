import type { NextFunction, Request, Response } from "express";

// Express recognizes this as an error handler because it takes 4 arguments.
// It must be registered last, after all routes.
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
  });
};
