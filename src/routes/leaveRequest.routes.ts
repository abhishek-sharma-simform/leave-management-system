import { Router } from "express";
import {
  createLeaveRequest,
  getMyLeaveRequests,
} from "../controllers/leaveRequest.controller.ts";
import { authMiddleware } from "../middleware/auth.middleware.ts";

const router = Router();

router.post("/", authMiddleware, createLeaveRequest);

router.get("/me", authMiddleware, getMyLeaveRequests);

export default router;
