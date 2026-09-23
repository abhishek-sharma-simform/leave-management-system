import type { Request, Response } from "express";
import { prisma } from "../config/prisma.ts";
import { calculateLeaveDays } from "../utils/dateUtils.ts";
import {
  updateLeaveRequest,
  cancelLeaveRequest,
  getLeaveRequestHistory,
  getMyLeaveRequests as getMyLeaveRequestsService,
  findTeammatesOnLeave,
} from "../services/leaveRequest.service.ts";

export async function createLeaveRequest(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const userId = req.user.id;
    const { leaveTypeId, startDate, endDate, reason } = req.body as {
      leaveTypeId: number;
      startDate: Date;
      endDate: Date;
      reason?: string | null;
    };

    // Check whether leave type exists
    const leaveType = await prisma.leaveType.findUnique({
      where: {
        id: leaveTypeId,
      },
    });

    if (!leaveType) {
      return res.status(400).json({
        error: "leaveTypeId does not exist",
      });
    }

    // Calculate requested leave days
    const requestedDays = calculateLeaveDays(startDate, endDate);

    // Preliminary balance check
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

    // Create leave request
    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId,
        leaveTypeId: leaveType.id,
        startDate,
        endDate,
        daysRequested: requestedDays,
        note: reason,
        status: "PENDING",
      },
    });

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
    const { page, limit, sortBy, sortOrder, status } = req.query as unknown as {
      page: number;
      limit: number;
      sortBy: "createdAt" | "startDate" | "status";
      sortOrder: "asc" | "desc";
      status?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
    };

    const result = await getMyLeaveRequestsService(userId!, {
      page,
      limit,
      sortBy,
      sortOrder,
      status,
    });

    return res.status(200).json(result);
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

    const requestId = (req.params as unknown as { id: number }).id;
    const { leaveTypeId, startDate, endDate, reason } = req.body as {
      leaveTypeId?: number;
      startDate?: Date;
      endDate?: Date;
      reason?: string | null;
    };

    const updates: {
      leaveTypeId?: number;
      startDate?: Date;
      endDate?: Date;
      reason?: string | null;
    } = {};

    if (leaveTypeId !== undefined) {
      updates.leaveTypeId = leaveTypeId;
    }

    if (startDate !== undefined) {
      updates.startDate = startDate;
    }

    if (endDate !== undefined) {
      updates.endDate = endDate;
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

    const requestId = (req.params as unknown as { id: number }).id;

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

export async function getTeamOnLeaveController(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const { startDate, endDate } = req.query as unknown as {
      startDate: Date;
      endDate: Date;
    };

    const requests = await findTeammatesOnLeave(
      req.user.id,
      startDate,
      endDate,
    );

    return res.status(200).json({
      startDate,
      endDate,
      teammatesOnLeave: requests.map((request) => ({
        userId: request.user.id,
        name: request.user.name,
        email: request.user.email,
        leaveType: request.leaveType.name,
        startDate: request.startDate,
        endDate: request.endDate,
        status: request.status,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return res.status(404).json({
        error: "User not found",
      });
    }

    console.error("Get teammates on leave error:", error);

    return res.status(500).json({
      error: "Failed to fetch teammates on leave",
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

    const requestId = (req.params as unknown as { id: number }).id;

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
