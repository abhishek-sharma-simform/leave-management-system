// Zod schemas for the /leave-requests routes. Only covers request *shape*
// (types, ranges, cross-field date ordering) — DB-dependent checks (leave type
// existence, balance sufficiency, ownership, status transitions) stay in
// leaveRequest.controller.ts / leaveRequest.service.ts.
import { z } from "zod";
import { paginationQuerySchema, sortSchema } from "./pagination.validator.ts";

// `:id` route param, coerced from a string to a positive integer.
export const leaveRequestIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Body for POST /leave-requests. `reason` is optional/nullable and maps onto
// the `note` column in the Prisma model (field names intentionally differ).
// The `.refine` enforces startDate <= endDate; this is the only cross-field
// check done here — balance sufficiency is checked later against the DB.
export const createLeaveRequestBodySchema = z
  .object({
    leaveTypeId: z.coerce.number().int().positive(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().optional().nullable(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "startDate must be before or equal to endDate",
    path: ["startDate"],
  });

// Body for PATCH /leave-requests/me/:id. All fields are optional since an edit
// may only change one of them; the date-order `.refine` only fires when both
// startDate and endDate are present in the same request.
export const updateLeaveRequestBodySchema = z
  .object({
    leaveTypeId: z.coerce.number().int().positive().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    reason: z.string().optional().nullable(),
  })
  .refine(
    (data) =>
      !data.startDate || !data.endDate || data.startDate <= data.endDate,
    {
      message: "startDate must be before or equal to endDate",
      path: ["startDate"],
    },
  );

// Query params for GET /leave-requests/me: shared pagination + sort schema
// (sortBy restricted to createdAt|startDate|status) plus an optional status
// filter unique to this endpoint.
export const listMyRequestsQuerySchema = paginationQuerySchema
  .merge(sortSchema(["createdAt", "startDate", "status"], "createdAt"))
  .extend({
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  });

// Query params for GET /leave-requests/team-on-leave. Same startDate <= endDate
// cross-field check as createLeaveRequestBodySchema, applied to a query instead
// of a body.
export const teamOnLeaveQuerySchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "startDate must be before or equal to endDate",
    path: ["startDate"],
  });
