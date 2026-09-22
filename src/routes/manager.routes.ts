import { Router } from "express";
import {
  getManagerRequests,
  getManagerRequestById,
  approveLeaveRequest,
  rejectLeaveRequest,
} from "../controllers/manager.controller.ts";
import { authMiddleware } from "../middleware/auth.middleware.ts";
import { requireRole } from "../middleware/role.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import {
  managerRequestIdParamsSchema,
  rejectReasonBodySchema,
  managerListQuerySchema,
} from "../validators/manager.validator.ts";

const router = Router();

router.get(
  "/requests",
  authMiddleware,
  requireRole("MANAGER"),
  validate(managerListQuerySchema, "query"),
  getManagerRequests,
);
router.get(
  "/requests/:id",
  authMiddleware,
  requireRole("MANAGER"),
  validate(managerRequestIdParamsSchema, "params"),
  getManagerRequestById,
);
router.post(
  "/requests/:id/approve",
  authMiddleware,
  requireRole("MANAGER"),
  validate(managerRequestIdParamsSchema, "params"),
  approveLeaveRequest,
);

router.post(
  "/requests/:id/reject",
  authMiddleware,
  requireRole("MANAGER"),
  validate(managerRequestIdParamsSchema, "params"),
  validate(rejectReasonBodySchema, "body"),
  rejectLeaveRequest,
);
export default router;
