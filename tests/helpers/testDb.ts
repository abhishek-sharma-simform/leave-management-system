import { prisma } from "../../src/config/prisma.ts";

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "LeaveDecision", "LeaveRequest", "LeaveBalance", "LeaveType", "User" RESTART IDENTITY CASCADE;`,
  );
}
