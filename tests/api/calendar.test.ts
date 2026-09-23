import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.ts";
import { resetDb } from "../helpers/testDb.ts";
import { createUser, createLeaveType, createLeaveRequest } from "../helpers/factories.ts";
import { authHeader } from "../helpers/authToken.ts";

beforeEach(async () => {
  await resetDb();
});

describe("GET /api/v1/calendar", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/v1/calendar?month=9&year=2026");
    expect(res.status).toBe(401);
  });

  it("returns 400 for a missing month/year", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const res = await request(app)
      .get("/api/v1/calendar")
      .set(authHeader(manager.id, "MANAGER"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an out-of-range month", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const res = await request(app)
      .get("/api/v1/calendar?month=13&year=2026")
      .set(authHeader(manager.id, "MANAGER"));
    expect(res.status).toBe(400);
  });

  it("returns only APPROVED requests from the manager's reports overlapping the month", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const otherManager = await createUser({ role: "MANAGER" });
    const report = await createUser({ managerId: manager.id });
    const nonReport = await createUser({ managerId: otherManager.id });
    const leaveType = await createLeaveType();

    // Spans the month boundary (Aug 28 - Sep 2) — should be included.
    const boundarySpanning = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 7, 28),
      endDate: new Date(2026, 8, 2),
      daysRequested: 4,
      status: "APPROVED",
    });
    // Pending — should be excluded.
    await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 10),
      endDate: new Date(2026, 8, 11),
      daysRequested: 2,
      status: "PENDING",
    });
    // Approved but a different manager's report — should be excluded.
    await createLeaveRequest({
      userId: nonReport.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 15),
      endDate: new Date(2026, 8, 16),
      daysRequested: 2,
      status: "APPROVED",
    });

    const res = await request(app)
      .get("/api/v1/calendar?month=9&year=2026")
      .set(authHeader(manager.id, "MANAGER"));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(boundarySpanning.id);
  });

  it("returns an EMPLOYEE's own team's (same manager's) approved leave overlapping the month", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const otherManager = await createUser({ role: "MANAGER" });
    const caller = await createUser({ managerId: manager.id });
    const teammate = await createUser({ managerId: manager.id });
    const nonTeammate = await createUser({ managerId: otherManager.id });
    const leaveType = await createLeaveType();

    // Teammate, approved, overlaps — should be included.
    const teammateLeave = await createLeaveRequest({
      userId: teammate.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 10),
      endDate: new Date(2026, 8, 11),
      daysRequested: 2,
      status: "APPROVED",
    });
    // Pending — should be excluded.
    await createLeaveRequest({
      userId: teammate.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 12),
      endDate: new Date(2026, 8, 13),
      daysRequested: 2,
      status: "PENDING",
    });
    // Approved but a different manager's report — should be excluded.
    await createLeaveRequest({
      userId: nonTeammate.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 15),
      endDate: new Date(2026, 8, 16),
      daysRequested: 2,
      status: "APPROVED",
    });

    const res = await request(app)
      .get("/api/v1/calendar?month=9&year=2026")
      .set(authHeader(caller.id, "EMPLOYEE"));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(teammateLeave.id);
  });

  it("returns an empty list for an EMPLOYEE with no manager", async () => {
    const caller = await createUser({ managerId: null });
    const res = await request(app)
      .get("/api/v1/calendar?month=9&year=2026")
      .set(authHeader(caller.id, "EMPLOYEE"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
