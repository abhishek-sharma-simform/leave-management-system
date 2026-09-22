import type { Request, Response } from "express";
import { login } from "../services/auth.service.ts";

export async function loginController(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        message: "Email and password must be strings",
      });
    }

    const result = await login(email, password);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(401).json({
      message: "Invalid email or password",
    });
  }
}
