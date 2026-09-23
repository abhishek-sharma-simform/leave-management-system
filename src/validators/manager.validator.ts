// Zod schemas for the /manager routes. manager.controller.ts has no
// manager.service.ts (documented exception in CLAUDE.md/README) and calls
// Prisma directly, but shape validation still goes through these schemas the
// same as every other route.
import { z } from "zod";
import { paginationQuerySchema, sortSchema } from "./pagination.validator.ts";

// `:id` route param (a leave request id) for GET/approve/reject.
export const managerRequestIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Body for POST /manager/requests/:id/reject — a non-empty, trimmed reason is
// required; approve has no body schema since it takes no input.
export const rejectReasonBodySchema = z.object({
  reason: z.string().trim().min(1, "Rejection reason is required"),
});

// Query params for GET /manager/requests: shared pagination + sort schema
// (sortBy restricted to createdAt|startDate) plus an optional status filter.
// Omitting `status` returns requests in every status; passing one restricts
// the list to that status only.
export const managerListQuerySchema = paginationQuerySchema
  .merge(sortSchema(["createdAt", "startDate"], "createdAt"))
  .extend({
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  });

// Query params for GET /manager/decisions (the manager's own approve/reject
// audit trail): shared pagination + sort schema (sortBy restricted to
// decidedAt, the only column on LeaveDecision worth ordering by) plus an
// optional action filter. Omitting `action` returns both approvals and
// rejections; passing one restricts the list to that action only.
export const managerDecisionsQuerySchema = paginationQuerySchema
  .merge(sortSchema(["decidedAt"], "decidedAt"))
  .extend({
    action: z.enum(["APPROVED", "REJECTED"]).optional(),
  });
