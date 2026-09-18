import { Router } from "express";
import { getLeaveTypesController } from "../controllers/leave-type.controller.ts";
import { authMiddleware } from "../middleware/auth.middleware.ts";

const router = Router();

router.get("/", authMiddleware, getLeaveTypesController);

export default router;
