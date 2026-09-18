import { Router } from "express";
import { loginController } from "../controllers/auth.controller.ts";
import { authMiddleware } from "../middleware/auth.middleware.ts";
import { requireRole } from "../middleware/role.middleware.ts";

const router = Router();

router.post("/login", loginController);
router.get(
  "/protected-test",
  authMiddleware,
  requireRole("MANAGER"),
  (req, res) => {
    res.json({
      message: "You are authenticated",
      user: req.user,
    });
  },
);

export default router;
