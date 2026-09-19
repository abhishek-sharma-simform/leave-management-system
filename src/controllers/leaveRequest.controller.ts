import type { Request, Response } from "express";
import { prisma } from "../config/prisma.ts";
import { calculateLeaveDays } from "../utils/dateUtils.ts";

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

    // 3. Validate dates are provided
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate and endDate are required",
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
        id: Number(leaveTypeId),
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
