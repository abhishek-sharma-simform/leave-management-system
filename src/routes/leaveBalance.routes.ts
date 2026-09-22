import { Router } from "express";
import { getMyLeaveBalancesController } from "../controllers/leaveBalance.controller.ts";
import { authMiddleware } from "../middleware/auth.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import { leaveBalanceQuerySchema } from "../validators/leaveBalance.validator.ts";

const router = Router();

router.get(
  "/me",
  authMiddleware,
  validate(leaveBalanceQuerySchema, "query"),
  getMyLeaveBalancesController,
);

export default router;
