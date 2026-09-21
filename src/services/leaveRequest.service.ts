import { prisma } from "../config/prisma.ts";

export async function findOverlappingRequests(requestId: number) {
  const request = await prisma.leaveRequest.findUnique({
    where: {
      id: requestId,
    },
    include: {
      user: true,
    },
  });

  if (!request) {
    throw new Error("Leave request not found");
  }

  const overlappingRequests = await prisma.leaveRequest.findMany({
    where: {
      status: {
        in: ["APPROVED", "PENDING"],
      },

      userId: {
        not: request.userId,
      },

      startDate: {
        lte: request.endDate,
      },

      endDate: {
        gte: request.startDate,
      },

      user: {
        managerId: request.user.managerId,
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
    },

    orderBy: {
      startDate: "asc",
    },
  });

  return overlappingRequests;
}
