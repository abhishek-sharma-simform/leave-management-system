import { z } from "zod";

const currentYear = new Date().getFullYear();

export const leaveBalanceQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(2100).default(currentYear),
});
