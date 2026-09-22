import jwt from "jsonwebtoken";

export function signToken(userId: number, role: "EMPLOYEE" | "MANAGER") {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: "1d",
  });
}

export function authHeader(userId: number, role: "EMPLOYEE" | "MANAGER") {
  return { Authorization: `Bearer ${signToken(userId, role)}` };
}
