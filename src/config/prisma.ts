//PrismaPg is the PostgreSQL adapter.
// It helps Prisma 7 communicate with your PostgreSQL database.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { DATABASE_URL } from "./env.ts";

//This basically says: Prisma, here's the information you need to connect to my PostgreSQL database
const adapter = new PrismaPg({ connectionString: DATABASE_URL });

// PrismaClient is the thing you'll use to actually query the database.
export const prisma = new PrismaClient({ adapter });
