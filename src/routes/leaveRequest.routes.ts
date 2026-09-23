import { Router } from "express";
import {
  createLeaveRequest,
  getMyLeaveRequests,
  updateMyLeaveRequest,
  cancelMyLeaveRequest,
  getLeaveRequestHistoryController,
  getTeamOnLeaveController,
} from "../controllers/leaveRequest.controller.ts";
import { authMiddleware } from "../middleware/auth.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import {
  createLeaveRequestBodySchema,
  updateLeaveRequestBodySchema,
  leaveRequestIdParamsSchema,
  listMyRequestsQuerySchema,
  teamOnLeaveQuerySchema,
} from "../validators/leaveRequest.validator.ts";

const router = Router();

router.post(
  "/",
  authMiddleware,
  validate(createLeaveRequestBodySchema, "body"),
  createLeaveRequest,
);

router.get(
  "/me",
  authMiddleware,
  validate(listMyRequestsQuerySchema, "query"),
  getMyLeaveRequests,
);

router.patch(
  "/me/:id",
  authMiddleware,
  validate(leaveRequestIdParamsSchema, "params"),
  validate(updateLeaveRequestBodySchema, "body"),
  updateMyLeaveRequest,
);

router.post(
  "/me/:id/cancel",
  authMiddleware,
  validate(leaveRequestIdParamsSchema, "params"),
  cancelMyLeaveRequest,
);

router.get(
  "/team-on-leave",
  authMiddleware,
  validate(teamOnLeaveQuerySchema, "query"),
  getTeamOnLeaveController,
);

router.get(
  "/:id/history",
  authMiddleware,
  validate(leaveRequestIdParamsSchema, "params"),
  getLeaveRequestHistoryController,
);

export default router;
