import type { Request, Response } from "express";
import { getLeaveTypes } from "../services/leave-type.service.ts";

export const getLeaveTypesController = async (req: Request, res: Response) => {
  const leaveTypes = await getLeaveTypes();

  res.json(leaveTypes);
};
