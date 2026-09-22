import type { Request, Response } from "express";
import { getMyLeaveBalances } from "../services/leaveBalance.service.ts";

export async function getMyLeaveBalancesController(
  req: Request,
  res: Response,
) {
  const userId = req.user!.id;
  const { year } = req.query as unknown as { year: number };

  const balances = await getMyLeaveBalances(userId, year);

  return res.status(200).json({
    year,
    balances: balances.map((balance) => ({
      leaveTypeId: balance.leaveTypeId,
      leaveTypeName: balance.leaveType.name,
      allocatedDays: balance.allocatedDays,
      usedDays: balance.usedDays,
      remainingDays: balance.allocatedDays - balance.usedDays,
    })),
  });
}
