import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.ts";
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

describe("POST /api/v1/leave-requests", () => {
  it("creates a request and computes weekday-only daysRequested", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType({ defaultAllowanceDays: 10 });
    await createLeaveBalance({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      allocatedDays: 10,
    });

    const res = await request(app)
      .post("/api/v1/leave-requests")
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({
        leaveTypeId: leaveType.id,
        startDate: "2026-09-21",
        endDate: "2026-09-23",
        reason: "trip",
      });

    expect(res.status).toBe(201);
    expect(res.body.daysRequested).toBe(3);
    expect(res.body.status).toBe("PENDING");
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/v1/leave-requests").send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 for a missing leaveTypeId", async () => {
    const employee = await createUser();
    const res = await request(app)
      .post("/api/v1/leave-requests")
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({ startDate: "2026-09-21", endDate: "2026-09-23" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unparsable date", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType();
    const res = await request(app)
      .post("/api/v1/leave-requests")
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({
        leaveTypeId: leaveType.id,
        startDate: "not-a-date",
        endDate: "2026-09-23",
      });
    expect(res.status).toBe(400);
  });

  it("returns 400 when startDate is after endDate", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType();
    const res = await request(app)
      .post("/api/v1/leave-requests")
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({
        leaveTypeId: leaveType.id,
        startDate: "2026-09-25",
        endDate: "2026-09-21",
      });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown leaveTypeId", async () => {
    const employee = await createUser();
    const res = await request(app)
      .post("/api/v1/leave-requests")
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({
        leaveTypeId: 999999,
        startDate: "2026-09-21",
        endDate: "2026-09-23",
      });
    expect(res.status).toBe(400);
  });

  it("returns 400 when no balance row exists", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType({ drawsFromBalance: true });
    const res = await request(app)
      .post("/api/v1/leave-requests")
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({
        leaveTypeId: leaveType.id,
        startDate: "2026-09-21",
        endDate: "2026-09-23",
      });
    expect(res.status).toBe(400);
  });

  it("returns 400 when requested days exceed remaining balance", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType({ drawsFromBalance: true });
    await createLeaveBalance({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      allocatedDays: 1,
      usedDays: 0,
    });
    const res = await request(app)
      .post("/api/v1/leave-requests")
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({
        leaveTypeId: leaveType.id,
        startDate: "2026-09-21",
        endDate: "2026-09-23",
      });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-string reason", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType();
    await createLeaveBalance({
      userId: employee.id,
      leaveTypeId: leaveType.id,
    });
    const res = await request(app)
      .post("/api/v1/leave-requests")
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({
        leaveTypeId: leaveType.id,
        startDate: "2026-09-21",
        endDate: "2026-09-21",
        reason: 12345,
      });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/leave-requests/me", () => {
  it("returns only the caller's own requests, newest first, paginated", async () => {
    const employee = await createUser();
    const other = await createUser();
    const leaveType = await createLeaveType();

    await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });
    await createLeaveRequest({
      userId: other.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 22),
      endDate: new Date(2026, 8, 22),
      daysRequested: 1,
    });

    const res = await request(app)
      .get("/api/v1/leave-requests/me")
      .set(authHeader(employee.id, "EMPLOYEE"));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].userId).toBe(employee.id);
    expect(res.body.meta.total).toBe(1);
  });

  it("returns an empty data array when the caller has no requests", async () => {
    const employee = await createUser();
    const res = await request(app)
      .get("/api/v1/leave-requests/me")
      .set(authHeader(employee.id, "EMPLOYEE"));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });
});

describe("PATCH /api/v1/leave-requests/me/:id", () => {
  it("edits a pending request", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType();
    await createLeaveBalance({
      userId: employee.id,
      leaveTypeId: leaveType.id,
    });
    const req1 = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .patch(`/api/v1/leave-requests/me/${req1.id}`)
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({ reason: "changed" });

    expect(res.status).toBe(200);
    expect(res.body.note).toBe("changed");
  });

  it("returns 404 for an unknown id", async () => {
    const employee = await createUser();
    const res = await request(app)
      .patch("/api/v1/leave-requests/me/999999")
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({ reason: "x" });
    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-owner", async () => {
    const owner = await createUser();
    const other = await createUser();
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: owner.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .patch(`/api/v1/leave-requests/me/${req1.id}`)
      .set(authHeader(other.id, "EMPLOYEE"))
      .send({ reason: "x" });
    expect(res.status).toBe(403);
  });

  it("returns 409 for an already-approved request", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
      status: "APPROVED",
    });

    const res = await request(app)
      .patch(`/api/v1/leave-requests/me/${req1.id}`)
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({ reason: "x" });
    expect(res.status).toBe(409);
  });

  it("returns 409 for a cancelled (not-pending) request", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
      status: "CANCELLED",
    });

    const res = await request(app)
      .patch(`/api/v1/leave-requests/me/${req1.id}`)
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({ reason: "x" });
    expect(res.status).toBe(409);
  });

  it("returns 400 for an invalid merged date range", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType();
    await createLeaveBalance({
      userId: employee.id,
      leaveTypeId: leaveType.id,
    });
    const req1 = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 23),
      daysRequested: 3,
    });

    const res = await request(app)
      .patch(`/api/v1/leave-requests/me/${req1.id}`)
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({ startDate: "2026-09-25" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown leaveTypeId", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType();
    await createLeaveBalance({
      userId: employee.id,
      leaveTypeId: leaveType.id,
    });
    const req1 = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .patch(`/api/v1/leave-requests/me/${req1.id}`)
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({ leaveTypeId: 999999 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the edit exceeds remaining balance", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType();
    await createLeaveBalance({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      allocatedDays: 1,
    });
    const req1 = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .patch(`/api/v1/leave-requests/me/${req1.id}`)
      .set(authHeader(employee.id, "EMPLOYEE"))
      .send({ startDate: "2026-09-21", endDate: "2026-09-25" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/leave-requests/me/:id/cancel", () => {
  it("cancels a pending request", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .post(`/api/v1/leave-requests/me/${req1.id}/cancel`)
      .set(authHeader(employee.id, "EMPLOYEE"));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
  });

  it("returns 404 for an unknown id", async () => {
    const employee = await createUser();
    const res = await request(app)
      .post("/api/v1/leave-requests/me/999999/cancel")
      .set(authHeader(employee.id, "EMPLOYEE"));
    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-owner", async () => {
    const owner = await createUser();
    const other = await createUser();
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: owner.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .post(`/api/v1/leave-requests/me/${req1.id}/cancel`)
      .set(authHeader(other.id, "EMPLOYEE"));
    expect(res.status).toBe(403);
  });

  it("returns 409 for an already-approved request", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
      status: "APPROVED",
    });

    const res = await request(app)
      .post(`/api/v1/leave-requests/me/${req1.id}/cancel`)
      .set(authHeader(employee.id, "EMPLOYEE"));
    expect(res.status).toBe(409);
  });
});

describe("GET /api/v1/leave-requests/:id/history", () => {
  it("is viewable by the owner", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .get(`/api/v1/leave-requests/${req1.id}/history`)
      .set(authHeader(employee.id, "EMPLOYEE"));

    expect(res.status).toBe(200);
    expect(res.body.leaveRequest.id).toBe(req1.id);
  });

  it("is viewable by the owner's manager", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const employee = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .get(`/api/v1/leave-requests/${req1.id}/history`)
      .set(authHeader(manager.id, "MANAGER"));

    expect(res.status).toBe(200);
  });

  it("returns 403 for an unrelated employee", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: owner.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .get(`/api/v1/leave-requests/${req1.id}/history`)
      .set(authHeader(stranger.id, "EMPLOYEE"));
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown id", async () => {
    const employee = await createUser();
    const res = await request(app)
      .get("/api/v1/leave-requests/999999/history")
      .set(authHeader(employee.id, "EMPLOYEE"));
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/v1/leave-requests/1/history");
    expect(res.status).toBe(401);
  });
});
