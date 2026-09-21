import type { Request, Response } from "express";
import { prisma } from "../config/prisma.ts";
import { calculateLeaveDays } from "../utils/dateUtils.ts";
import {
  updateLeaveRequest,
  cancelLeaveRequest,
  getLeaveRequestHistory,
} from "../services/leaveRequest.service.ts";

export async function createLeaveRequest(req: Request, res: Response) {
  try {
    const { leaveTypeId, startDate, endDate, reason } = req.body;

    // 1. Get user ID from authenticated user
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const userId = req.user.id;

    // 2. Validate leaveTypeId
    if (!leaveTypeId) {
      return res.status(400).json({
        error: "leaveTypeId is required",
      });
    }

    const leaveTypeIdNum = Number(leaveTypeId);

    if (!Number.isInteger(leaveTypeIdNum) || leaveTypeIdNum <= 0) {
      return res.status(400).json({
        error: "leaveTypeId must be a positive integer",
      });
    }

    // 3. Validate dates are provided
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate and endDate are required",
      });
    }

    // 3b. Validate reason type, if provided
    if (reason !== undefined && reason !== null && typeof reason !== "string") {
      return res.status(400).json({
        error: "reason must be a string",
      });
    }

    // 4. Convert strings to Date objects
    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    // 5. Validate dates
    if (
      Number.isNaN(parsedStartDate.getTime()) ||
      Number.isNaN(parsedEndDate.getTime())
    ) {
      return res.status(400).json({
        error: "startDate and endDate must be valid dates",
      });
    }

    // 6. Validate startDate <= endDate
    if (parsedStartDate > parsedEndDate) {
      return res.status(400).json({
        error: "startDate must be before or equal to endDate",
      });
    }

    // 7. Check whether leave type exists
    const leaveType = await prisma.leaveType.findUnique({
      where: {
        id: leaveTypeIdNum,
      },
    });

    if (!leaveType) {
      return res.status(400).json({
        error: "leaveTypeId does not exist",
      });
    }

    // 8. Calculate requested leave days
    const requestedDays = calculateLeaveDays(parsedStartDate, parsedEndDate);

    // 9. Preliminary balance check
    if (leaveType.drawsFromBalance) {
      const currentYear = new Date().getFullYear();

      const balance = await prisma.leaveBalance.findUnique({
        where: {
          userId_leaveTypeId_year: {
            userId,
            leaveTypeId: leaveType.id,
            year: currentYear,
          },
        },
      });

      if (!balance) {
        return res.status(400).json({
          error: "Leave balance not found for this leave type",
        });
      }

      const remainingDays = balance.allocatedDays - balance.usedDays;

      if (requestedDays > remainingDays) {
        return res.status(400).json({
          error: "Requested leave exceeds your remaining balance",
        });
      }
    }

    // 10. Create leave request
    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId,
        leaveTypeId: leaveType.id,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        daysRequested: requestedDays,
        note: reason,
        status: "PENDING",
      },
    });

    // 11. Return created request
    return res.status(201).json(leaveRequest);
  } catch (error) {
    console.error("Create leave request error:", error);

    return res.status(500).json({
      error: "Failed to create leave request",
    });
  }
}

export async function getMyLeaveRequests(req: Request, res: Response) {
  try {
    const userId = req?.user?.id;

    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        userId,
      },
      include: {
        leaveType: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Get my leave requests error:", error);

    return res.status(500).json({
      error: "Failed to fetch leave requests",
    });
  }
}

export async function updateMyLeaveRequest(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const requestId = Number(req.params.id);

    if (!Number.isInteger(requestId)) {
      return res.status(400).json({
        error: "Invalid request ID",
      });
    }

    const { leaveTypeId, startDate, endDate, reason } = req.body ?? {};

    const updates: {
      leaveTypeId?: number;
      startDate?: Date;
      endDate?: Date;
      reason?: string | null;
    } = {};

    if (leaveTypeId !== undefined) {
      const leaveTypeIdNum = Number(leaveTypeId);

      if (!Number.isInteger(leaveTypeIdNum) || leaveTypeIdNum <= 0) {
        return res.status(400).json({
          error: "leaveTypeId must be a positive integer",
        });
      }

      updates.leaveTypeId = leaveTypeIdNum;
    }

    if (startDate !== undefined) {
      const parsedStartDate = new Date(startDate);

      if (Number.isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({
          error: "startDate must be a valid date",
        });
      }

      updates.startDate = parsedStartDate;
    }

    if (endDate !== undefined) {
      const parsedEndDate = new Date(endDate);

      if (Number.isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({
          error: "endDate must be a valid date",
        });
      }

      updates.endDate = parsedEndDate;
    }

    if (reason !== undefined && reason !== null && typeof reason !== "string") {
      return res.status(400).json({
        error: "reason must be a string",
      });
    }

    if (reason !== undefined) {
      updates.reason = reason;
    }

    const updated = await updateLeaveRequest(req.user.id, requestId, updates);

    return res.status(200).json(updated);
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "NOT_FOUND":
          return res.status(404).json({
            error: "Leave request not found",
          });
        case "FORBIDDEN":
          return res.status(403).json({
            error: "You are not allowed to edit this request",
          });
        case "ALREADY_APPROVED":
          return res.status(409).json({
            error:
              "This request has already been approved and can no longer be edited. Use POST /me/requests/:id/cancel to cancel it instead.",
          });
        case "NOT_PENDING":
          return res.status(409).json({
            error: "Only pending requests can be edited",
          });
        case "INVALID_DATE_RANGE":
          return res.status(400).json({
            error: "startDate must be before or equal to endDate",
          });
        case "LEAVE_TYPE_NOT_FOUND":
          return res.status(400).json({
            error: "leaveTypeId does not exist",
          });
        case "BALANCE_NOT_FOUND":
          return res.status(400).json({
            error: "Leave balance not found for this leave type",
          });
        case "INSUFFICIENT_BALANCE":
          return res.status(400).json({
            error: "Requested leave exceeds your remaining balance",
          });
      }
    }

    console.error("Update leave request error:", error);

    return res.status(500).json({
      error: "Failed to update leave request",
    });
  }
}

export async function cancelMyLeaveRequest(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const requestId = Number(req.params.id);

    if (!Number.isInteger(requestId)) {
      return res.status(400).json({
        error: "Invalid request ID",
      });
    }

    const cancelled = await cancelLeaveRequest(req.user.id, requestId);

    return res.status(200).json(cancelled);
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "NOT_FOUND":
          return res.status(404).json({
            error: "Leave request not found",
          });
        case "FORBIDDEN":
          return res.status(403).json({
            error: "You are not allowed to cancel this request",
          });
        case "ALREADY_APPROVED":
          return res.status(409).json({
            error:
              "This request has already been approved and cannot be cancelled",
          });
        case "NOT_PENDING":
          return res.status(409).json({
            error: "Only pending requests can be cancelled",
          });
      }
    }

    console.error("Cancel leave request error:", error);

    return res.status(500).json({
      error: "Failed to cancel leave request",
    });
  }
}

export async function getLeaveRequestHistoryController(
  req: Request,
  res: Response,
) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const requestId = Number(req.params.id);

    if (!Number.isInteger(requestId)) {
      return res.status(400).json({
        error: "Invalid request ID",
      });
    }

    const request = await getLeaveRequestHistory(
      req.user.id,
      req.user.role,
      requestId,
    );

    return res.status(200).json({
      leaveRequest: {
        id: request.id,
        userId: request.userId,
        leaveTypeId: request.leaveTypeId,
        startDate: request.startDate,
        endDate: request.endDate,
        daysRequested: request.daysRequested,
        status: request.status,
        note: request.note,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      },
      history: request.decisions.map((decision) => ({
        id: decision.id,
        action: decision.action,
        reason: decision.reason,
        decidedAt: decision.decidedAt,
        actor: decision.actor,
      })),
    });
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "NOT_FOUND":
          return res.status(404).json({
            error: "Leave request not found",
          });
        case "FORBIDDEN":
          return res.status(403).json({
            error: "You are not allowed to view this request's history",
          });
      }
    }

    console.error("Get leave request history error:", error);

    return res.status(500).json({
      error: "Failed to fetch leave request history",
    });
  }
}
