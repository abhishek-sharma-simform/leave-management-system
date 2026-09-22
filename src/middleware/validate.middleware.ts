import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

type ValidationSource = "body" | "query" | "params";

export function validate(schema: ZodType, source: ValidationSource) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    if (source === "query") {
      // req.query is a getter-only accessor defined by Express (no setter),
      // so a plain assignment throws in strict-mode ESM. Shadow it with an
      // own, writable property instead.
      Object.defineProperty(req, "query", {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      req[source] = result.data as any;
    }

    next();
  };
}
