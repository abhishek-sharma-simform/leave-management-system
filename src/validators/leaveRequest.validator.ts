import { z } from "zod";
import { paginationQuerySchema, sortSchema } from "./pagination.validator.ts";

export const leaveRequestIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

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

export const listMyRequestsQuerySchema = paginationQuerySchema
  .merge(sortSchema(["createdAt", "startDate", "status"], "createdAt"))
  .extend({
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  });
