import { prisma } from "../config/prisma.ts";

export async function getTeamCalendar(
  requesterId: number,
  requesterRole: string,
  month: number,
  year: number,
) {
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(year, month, 1));

  // A manager's team is their own direct reports; an employee's team is
  // everyone (including themselves) sharing their own manager.
  let teamManagerId: number;

  if (requesterRole === "MANAGER") {
    teamManagerId = requesterId;
  } else {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { managerId: true },
    });

    if (!requester) {
      throw new Error("NOT_FOUND");
    }

    if (!requester.managerId) {
      return [];
    }

    teamManagerId = requester.managerId;
  }

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
        managerId: teamManagerId,
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
