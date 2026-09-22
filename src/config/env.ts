import dotenv from "dotenv";

dotenv.config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
});

export const PORT = process.env.PORT || 5000;

export const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in the environment variables.");
}

export const NODE_ENV = process.env.NODE_ENV || "development";

export const LOG_LEVEL =
  process.env.LOG_LEVEL || (NODE_ENV === "production" ? "info" : "debug");
