import type { Request, Response } from "express";
import { getTeamCalendar } from "../services/calendar.service.ts";

export async function getCalendar(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const { month: monthParam, year: yearParam } = req.query;

    if (!monthParam || !yearParam) {
      return res.status(400).json({
        message: "month and year are required",
      });
    }

    const month = Number(monthParam);
    const year = Number(yearParam);

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({
        message: "month must be an integer between 1 and 12",
      });
    }

    if (!Number.isInteger(year) || year < 1970 || year > 2100) {
      return res.status(400).json({
        message: "year must be a valid 4-digit year",
      });
    }

    const leaveRequests = await getTeamCalendar(
      req.user.id,
      req.user.role,
      month,
      year,
    );

    return res.status(200).json(leaveRequests);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return res.status(404).json({
        message: "User not found",
      });
    }

    console.error("Get team calendar error:", error);

    return res.status(500).json({
      message: "Failed to fetch team calendar",
    });
  }
}
