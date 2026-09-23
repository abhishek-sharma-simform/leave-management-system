import { Router } from "express";
import { getCalendar } from "../controllers/calendar.controller.ts";
import { authMiddleware } from "../middleware/auth.middleware.ts";

const router = Router();

router.get("/", authMiddleware, getCalendar);

export default router;
