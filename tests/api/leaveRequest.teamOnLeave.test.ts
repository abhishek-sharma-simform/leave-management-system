import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.ts";
import { resetDb } from "../helpers/testDb.ts";
import { createUser, createLeaveType, createLeaveRequest } from "../helpers/factories.ts";
import { authHeader } from "../helpers/authToken.ts";

beforeEach(async () => {
  await resetDb();
});

describe("GET /api/v1/leave-requests/team-on-leave", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get(
      "/api/v1/leave-requests/team-on-leave?startDate=2026-05-10&endDate=2026-05-15",
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when startDate/endDate are missing", async () => {
    const user = await createUser();
    const res = await request(app)
      .get("/api/v1/leave-requests/team-on-leave")
      .set(authHeader(user.id, "EMPLOYEE"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when startDate is after endDate", async () => {
    const user = await createUser();
    const res = await request(app)
      .get(
        "/api/v1/leave-requests/team-on-leave?startDate=2026-05-15&endDate=2026-05-10",
      )
      .set(authHeader(user.id, "EMPLOYEE"));
    expect(res.status).toBe(400);
  });

  it("returns an empty list for a caller with no manager", async () => {
    const user = await createUser({ managerId: null });
    const res = await request(app)
      .get(
        "/api/v1/leave-requests/team-on-leave?startDate=2026-05-10&endDate=2026-05-15",
      )
      .set(authHeader(user.id, "EMPLOYEE"));

    expect(res.status).toBe(200);
    expect(res.body.teammatesOnLeave).toEqual([]);
  });

  it("returns overlapping APPROVED requests from teammates under the same manager", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const otherManager = await createUser({ role: "MANAGER" });
    const caller = await createUser({ managerId: manager.id });
    const teammate = await createUser({ managerId: manager.id });
    const nonTeammate = await createUser({ managerId: otherManager.id });
    const leaveType = await createLeaveType();

    // Teammate, approved, overlaps — should be included.
    const overlappingApproved = await createLeaveRequest({
      userId: teammate.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 4, 12),
      endDate: new Date(2026, 4, 13),
      daysRequested: 2,
      status: "APPROVED",
    });
    // Teammate, pending, overlaps — should be excluded (only APPROVED counts).
    await createLeaveRequest({
      userId: teammate.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 4, 14),
      endDate: new Date(2026, 4, 20),
      daysRequested: 5,
      status: "PENDING",
    });
    // Teammate, approved, but rejected/cancelled don't count.
    await createLeaveRequest({
      userId: teammate.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 4, 11),
      endDate: new Date(2026, 4, 11),
      daysRequested: 1,
      status: "REJECTED",
    });
    // Non-overlapping date range — should be excluded.
    await createLeaveRequest({
      userId: teammate.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 4, 1),
      endDate: new Date(2026, 4, 2),
      daysRequested: 2,
      status: "APPROVED",
    });
    // Different manager's report — should be excluded.
    await createLeaveRequest({
      userId: nonTeammate.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 4, 12),
      endDate: new Date(2026, 4, 13),
      daysRequested: 2,
      status: "APPROVED",
    });
    // Caller's own overlapping request — should be excluded.
    await createLeaveRequest({
      userId: caller.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 4, 12),
      endDate: new Date(2026, 4, 13),
      daysRequested: 2,
      status: "APPROVED",
    });

    const res = await request(app)
      .get(
        "/api/v1/leave-requests/team-on-leave?startDate=2026-05-10&endDate=2026-05-15",
      )
      .set(authHeader(caller.id, "EMPLOYEE"));

    expect(res.status).toBe(200);
    expect(res.body.teammatesOnLeave).toHaveLength(1);
    expect(res.body.teammatesOnLeave[0].startDate).toBe(
      overlappingApproved.startDate.toISOString(),
    );
    expect(res.body.teammatesOnLeave[0].userId).toBe(teammate.id);
  });
});
