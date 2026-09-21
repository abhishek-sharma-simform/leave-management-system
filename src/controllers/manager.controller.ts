import type { Request, Response } from "express";
import { prisma } from "../config/prisma.ts";
import { findOverlappingRequests } from "../services/leaveRequest.service.ts";

type LeaveBalanceRow = {
  id: number;
  userId: number;
  leaveTypeId: number;
  year: number;
  allocatedDays: number;
  usedDays: number;
};

export async function getManagerRequests(req: Request, res: Response) {
  try {
    const managerId = req?.user?.id;

    const requests = await prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        user: {
          managerId,
        },
      },
      include: {
        user: true,
        leaveType: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json(requests);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch manager requests",
    });
  }
}

export async function getManagerRequestById(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const managerId = req?.user?.id;

    if (!Number.isInteger(requestId)) {
      return res.status(400).json({
        message: "Invalid request ID",
      });
    }

    const request = await prisma.leaveRequest.findFirst({
      where: {
        id: requestId,
        user: {
          managerId,
        },
      },
      include: {
        user: true,
        leaveType: true,
        decisions: true,
      },
    });

    if (!request) {
      return res.status(404).json({
        message: "Leave request not found",
      });
    }

    const overlappingRequests = await findOverlappingRequests(requestId);

    return res.status(200).json({
      ...request,
      overlappingRequests,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch leave request",
    });
  }
}

export async function approveLeaveRequest(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const managerId = req?.user?.id;

    if (!Number.isInteger(requestId)) {
      return res.status(400).json({
        message: "Invalid request ID",
      });
    }

    const request = await prisma.leaveRequest.findUnique({
      where: {
        id: requestId,
      },
      include: {
        user: {
          select: {
            managerId: true,
          },
        },
        leaveType: {
          select: {
            drawsFromBalance: true,
          },
        },
      },
    });

    if (!request) {
      return res.status(404).json({
        message: "Leave request not found",
      });
    }

    if (request.user.managerId !== managerId) {
      return res.status(403).json({
        message: "You are not allowed to approve this request",
      });
    }

    if (request.userId === managerId) {
      return res.status(403).json({
        message: "You cannot approve your own leave request",
      });
    }

    if (request.status !== "PENDING") {
      return res.status(400).json({
        message: "Only pending requests can be approved",
      });
    }

    const year = request.startDate.getFullYear();

    await prisma.$transaction(async (tx) => {
      if (request.leaveType.drawsFromBalance) {
        const balances = await tx.$queryRaw<LeaveBalanceRow[]>`
          SELECT *
          FROM "LeaveBalance"
          WHERE "userId" = ${request.userId}
            AND "leaveTypeId" = ${request.leaveTypeId}
            AND "year" = ${year}
          FOR UPDATE
        `;

        const balance = balances[0];

        if (!balance) {
          throw new Error("BALANCE_NOT_FOUND");
        }

        const remaining = balance.allocatedDays - balance.usedDays;

        if (remaining < request.daysRequested) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        await tx.leaveBalance.update({
          where: {
            id: balance.id,
          },
          data: {
            usedDays: {
              increment: request.daysRequested,
            },
          },
        });
      }

      await tx.leaveRequest.update({
        where: {
          id: request.id,
        },
        data: {
          status: "APPROVED",
        },
      });

      await tx.leaveDecision.create({
        data: {
          requestId: request.id,
          actorId: managerId,
          action: "APPROVED",
        },
      });
    });

    return res.status(200).json({
      message: "Leave request approved successfully",
    });
  } catch (error) {
    console.error(error);

    if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({
        message: "Insufficient leave balance",
      });
    }

    if (error instanceof Error && error.message === "BALANCE_NOT_FOUND") {
      return res.status(400).json({
        message: "Leave balance not found",
      });
    }

    return res.status(500).json({
      message: "Failed to approve leave request",
    });
  }
}

export async function rejectLeaveRequest(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const managerId = req?.user?.id;

    if (!Number.isInteger(requestId)) {
      return res.status(400).json({
        message: "Invalid request ID",
      });
    }

    const { reason } = req.body ?? {};

    if (typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({
        message: "Rejection reason is required",
      });
    }

    const request = await prisma.leaveRequest.findUnique({
      where: {
        id: requestId,
      },
      include: {
        user: true,
      },
    });

    if (!request) {
      return res.status(404).json({
        message: "Leave request not found",
      });
    }

    if (request.user.managerId !== managerId) {
      return res.status(403).json({
        message: "You are not allowed to reject this request",
      });
    }

    if (request.userId === managerId) {
      return res.status(403).json({
        message: "You cannot reject your own leave request",
      });
    }

    if (request.status !== "PENDING") {
      return res.status(400).json({
        message: "Only pending requests can be rejected",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: {
          id: request.id,
        },
        data: {
          status: "REJECTED",
        },
      });

      await tx.leaveDecision.create({
        data: {
          requestId: request.id,
          actorId: managerId,
          action: "REJECTED",
          reason: reason.trim(),
        },
      });
    });

    return res.status(200).json({
      message: "Leave request rejected successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to reject leave request",
    });
  }
}
