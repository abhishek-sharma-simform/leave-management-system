import { prisma } from "../config/prisma.ts";
import { calculateLeaveDays } from "../utils/dateUtils.ts";

type LeaveRequestUpdateInput = {
  leaveTypeId?: number;
  startDate?: Date;
  endDate?: Date;
  reason?: string | null;
};

export async function updateLeaveRequest(
  userId: number,
  requestId: number,
  updates: LeaveRequestUpdateInput,
) {
  const existing = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
  });

  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  if (existing.userId !== userId) {
    throw new Error("FORBIDDEN");
  }

  if (existing.status === "APPROVED") {
    throw new Error("ALREADY_APPROVED");
  }

  if (existing.status !== "PENDING") {
    throw new Error("NOT_PENDING");
  }

  const leaveTypeId = updates.leaveTypeId ?? existing.leaveTypeId;
  const startDate = updates.startDate ?? existing.startDate;
  const endDate = updates.endDate ?? existing.endDate;

  if (startDate > endDate) {
    throw new Error("INVALID_DATE_RANGE");
  }

  const leaveType = await prisma.leaveType.findUnique({
    where: { id: leaveTypeId },
  });

  if (!leaveType) {
    throw new Error("LEAVE_TYPE_NOT_FOUND");
  }

  const daysRequested = calculateLeaveDays(startDate, endDate);

  if (leaveType.drawsFromBalance) {
    const year = startDate.getFullYear();

    const balance = await prisma.leaveBalance.findUnique({
      where: {
        userId_leaveTypeId_year: {
          userId,
          leaveTypeId: leaveType.id,
          year,
        },
      },
    });

    if (!balance) {
      throw new Error("BALANCE_NOT_FOUND");
    }

    const remainingDays = balance.allocatedDays - balance.usedDays;

    if (daysRequested > remainingDays) {
      throw new Error("INSUFFICIENT_BALANCE");
    }
  }

  return prisma.leaveRequest.update({
    where: { id: requestId },
    data: {
      leaveTypeId: leaveType.id,
      startDate,
      endDate,
      daysRequested,
      note: updates.reason !== undefined ? updates.reason : existing.note,
    },
  });
}

export async function cancelLeaveRequest(userId: number, requestId: number) {
  const existing = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
  });

  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  if (existing.userId !== userId) {
    throw new Error("FORBIDDEN");
  }

  if (existing.status === "APPROVED") {
    throw new Error("ALREADY_APPROVED");
  }

  if (existing.status !== "PENDING") {
    throw new Error("NOT_PENDING");
  }

  return prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: "CANCELLED" },
  });
}

export async function getLeaveRequestHistory(
  requesterId: number,
  requesterRole: string,
  requestId: number,
) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      user: {
        select: { id: true, managerId: true },
      },
      decisions: {
        include: {
          actor: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { decidedAt: "asc" },
      },
    },
  });

  if (!request) {
    throw new Error("NOT_FOUND");
  }

  const isOwner = request.userId === requesterId;
  const isManager =
    requesterRole === "MANAGER" && request.user.managerId === requesterId;

  if (!isOwner && !isManager) {
    throw new Error("FORBIDDEN");
  }

  return request;
}

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
