import { Router } from "express";
import {
  createLeaveRequest,
  getMyLeaveRequests,
  updateMyLeaveRequest,
  cancelMyLeaveRequest,
  getLeaveRequestHistoryController,
} from "../controllers/leaveRequest.controller.ts";
import { authMiddleware } from "../middleware/auth.middleware.ts";

const router = Router();

router.post("/", authMiddleware, createLeaveRequest);

router.get("/me", authMiddleware, getMyLeaveRequests);

router.patch("/me/:id", authMiddleware, updateMyLeaveRequest);

router.post("/me/:id/cancel", authMiddleware, cancelMyLeaveRequest);

router.get("/:id/history", authMiddleware, getLeaveRequestHistoryController);

export default router;
