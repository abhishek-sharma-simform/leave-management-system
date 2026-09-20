import { Router } from "express";
import {
  getManagerRequests,
  getManagerRequestById,
  approveLeaveRequest,
  rejectLeaveRequest,
} from "../controllers/manager.controller.ts";
import { authMiddleware } from "../middleware/auth.middleware.ts";
import { requireRole } from "../middleware/role.middleware.ts";

const router = Router();

router.get(
  "/requests",
  authMiddleware,
  requireRole("MANAGER"),
  getManagerRequests,
);
router.get(
  "/requests/:id",
  authMiddleware,
  requireRole("MANAGER"),
  getManagerRequestById,
);
router.post(
  "/requests/:id/approve",
  authMiddleware,
  requireRole("MANAGER"),
  approveLeaveRequest,
);

router.post(
  "/requests/:id/reject",
  authMiddleware,
  requireRole("MANAGER"),
  rejectLeaveRequest,
);
export default router;
