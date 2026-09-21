import { Router } from "express";
import { getCalendar } from "../controllers/calendar.controller.ts";
import { authMiddleware } from "../middleware/auth.middleware.ts";
import { requireRole } from "../middleware/role.middleware.ts";

const router = Router();

router.get("/", authMiddleware, requireRole("MANAGER"), getCalendar);

export default router;
