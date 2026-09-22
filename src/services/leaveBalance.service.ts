import { prisma } from "../config/prisma.ts";

export async function getMyLeaveBalances(userId: number, year: number) {
  return prisma.leaveBalance.findMany({
    where: { userId, year },
    include: { leaveType: true },
    orderBy: { leaveType: { name: "asc" } },
  });
}
