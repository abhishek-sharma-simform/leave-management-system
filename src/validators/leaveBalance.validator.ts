// Validates the `?year=` query param for GET /api/v1/leave-balances/me.
import { z } from "zod";

const currentYear = new Date().getFullYear();

// `year` defaults to the current year when omitted and is bounded to a sane
// 1970-2100 range (same bounds used by the hand-rolled month/year check in
// calendar.controller.ts).
export const leaveBalanceQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(2100).default(currentYear),
});
