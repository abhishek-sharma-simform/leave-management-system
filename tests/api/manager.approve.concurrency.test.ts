import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.ts";
import { prisma } from "../../src/config/prisma.ts";
import { resetDb } from "../helpers/testDb.ts";
import {
  createUser,
  createLeaveType,
  createLeaveBalance,
  createLeaveRequest,
} from "../helpers/factories.ts";
import { authHeader } from "../helpers/authToken.ts";

beforeEach(async () => {
  await resetDb();
});

describe("concurrent approvals against the same balance", () => {
  it("never lets usedDays exceed allocatedDays, and approves exactly one of two competing requests", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const report = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();

    // Just enough remaining balance for exactly one of the two 5-day requests.
    await createLeaveBalance({
      userId: report.id,
      leaveTypeId: leaveType.id,
      allocatedDays: 5,
      usedDays: 0,
    });

    const requestA = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 14), // Mon
      endDate: new Date(2026, 8, 18), // Fri = 5 weekdays
      daysRequested: 5,
    });
    const requestB = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 9, 5), // Mon (different month, no overlap)
      endDate: new Date(2026, 9, 9), // Fri = 5 weekdays
      daysRequested: 5,
    });

    const managerHeader = authHeader(manager.id, "MANAGER");

    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/v1/manager/requests/${requestA.id}/approve`)
        .set(managerHeader),
      request(app)
        .post(`/api/v1/manager/requests/${requestB.id}/approve`)
        .set(managerHeader),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // Exactly one call succeeds (200); the other fails on the re-checked
    // balance (400) — never both succeeding, never both failing.
    expect(statuses).toEqual([200, 400]);

    const balance = await prisma.leaveBalance.findFirstOrThrow({
      where: { userId: report.id, leaveTypeId: leaveType.id },
    });
    expect(balance.usedDays).toBeLessThanOrEqual(balance.allocatedDays);
    expect(balance.usedDays).toBe(5);

    const approvedRequests = await prisma.leaveRequest.findMany({
      where: { id: { in: [requestA.id, requestB.id] }, status: "APPROVED" },
    });
    expect(approvedRequests).toHaveLength(1);

    const decisions = await prisma.leaveDecision.findMany({
      where: { requestId: { in: [requestA.id, requestB.id] } },
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe("APPROVED");
  });
});
