import { prisma } from "../config/prisma.ts";

export async function getTeamCalendar(
  managerId: number,
  month: number,
  year: number,
) {
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(year, month, 1));

  return prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: {
        lt: startOfNextMonth,
      },
      endDate: {
        gte: startOfMonth,
      },
      user: {
        managerId,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      leaveType: true,
    },
    orderBy: {
      startDate: "asc",
    },
  });
}
