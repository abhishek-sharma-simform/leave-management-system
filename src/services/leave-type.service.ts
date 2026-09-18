import { prisma } from "../config/prisma.ts";

export const getLeaveTypes = async () => {
  return prisma.leaveType.findMany();
};
