import { Router } from "express";
import healthRoutes from "./health.routes.ts";
import authRoutes from "./auth.routes.ts";
import leaveTypeRoutes from "./leave-type.routes.ts";
import leaveRequestRoutes from "./leaveRequest.routes.ts";

const router = Router();

router.use(healthRoutes);
router.use("/auth", authRoutes);
router.use("/leave-types", leaveTypeRoutes);
router.use("/leave-requests", leaveRequestRoutes);

export default router;
