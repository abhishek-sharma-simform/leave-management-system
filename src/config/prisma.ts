//PrismaPg is the PostgreSQL adapter.
// It helps Prisma 7 communicate with your PostgreSQL database.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { DATABASE_URL } from "./env.ts";

// Hosted Postgres providers (Render, etc.) require SSL on external connections;
// local dev Postgres typically doesn't have SSL configured at all.
const isLocalDb =
  DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1");

//This basically says: Prisma, here's the information you need to connect to my PostgreSQL database
const adapter = new PrismaPg({
  connectionString: DATABASE_URL,
  ...(isLocalDb ? {} : { ssl: { rejectUnauthorized: false } }),
});

// PrismaClient is the thing you'll use to actually query the database.
export const prisma = new PrismaClient({ adapter });
