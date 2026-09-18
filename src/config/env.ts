import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT || 5000;

export const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in the environment variables.");
}
