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

describe("GET /api/v1/manager/requests", () => {
  it("returns only PENDING requests from the manager's direct reports", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const otherManager = await createUser({ role: "MANAGER" });
    const report = await createUser({ managerId: manager.id });
    const nonReport = await createUser({ managerId: otherManager.id });
    const leaveType = await createLeaveType();

    const pending = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });
    await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 22),
      endDate: new Date(2026, 8, 22),
      daysRequested: 1,
      status: "APPROVED",
    });
    await createLeaveRequest({
      userId: nonReport.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 23),
      endDate: new Date(2026, 8, 23),
      daysRequested: 1,
    });

    const res = await request(app)
      .get("/api/v1/manager/requests")
      .set(authHeader(manager.id, "MANAGER"));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(pending.id);
  });

  it("returns 403 for an EMPLOYEE", async () => {
    const employee = await createUser({ role: "EMPLOYEE" });
    const res = await request(app)
      .get("/api/v1/manager/requests")
      .set(authHeader(employee.id, "EMPLOYEE"));
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/v1/manager/requests");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/manager/requests/:id", () => {
  it("includes overlappingRequests", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const reportA = await createUser({ managerId: manager.id });
    const reportB = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();

    const target = await createLeaveRequest({
      userId: reportA.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 20),
      endDate: new Date(2026, 8, 24),
      daysRequested: 3,
    });
    await createLeaveRequest({
      userId: reportB.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 22),
      endDate: new Date(2026, 8, 26),
      daysRequested: 3,
      status: "APPROVED",
    });

    const res = await request(app)
      .get(`/api/v1/manager/requests/${target.id}`)
      .set(authHeader(manager.id, "MANAGER"));

    expect(res.status).toBe(200);
    expect(res.body.overlappingRequests).toHaveLength(1);
  });

  it("returns 404 for a request from a foreign team", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const otherManager = await createUser({ role: "MANAGER" });
    const nonReport = await createUser({ managerId: otherManager.id });
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: nonReport.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .get(`/api/v1/manager/requests/${req1.id}`)
      .set(authHeader(manager.id, "MANAGER"));
    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-integer id", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const res = await request(app)
      .get("/api/v1/manager/requests/abc")
      .set(authHeader(manager.id, "MANAGER"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/manager/requests/:id/approve", () => {
  it("approves a pending request and increments usedDays", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const report = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();
    await createLeaveBalance({
      userId: report.id,
      leaveTypeId: leaveType.id,
      allocatedDays: 10,
      usedDays: 0,
    });
    const req1 = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 23),
      daysRequested: 3,
    });

    const res = await request(app)
      .post(`/api/v1/manager/requests/${req1.id}/approve`)
      .set(authHeader(manager.id, "MANAGER"));

    expect(res.status).toBe(200);

    const updatedRequest = await prisma.leaveRequest.findUniqueOrThrow({
      where: { id: req1.id },
    });
    expect(updatedRequest.status).toBe("APPROVED");

    const balance = await prisma.leaveBalance.findUniqueOrThrow({
      where: {
        userId_leaveTypeId_year: {
          userId: report.id,
          leaveTypeId: leaveType.id,
          year: new Date().getFullYear(),
        },
      },
    });
    expect(balance.usedDays).toBe(3);

    const decisions = await prisma.leaveDecision.findMany({
      where: { requestId: req1.id },
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe("APPROVED");
    expect(decisions[0].actorId).toBe(manager.id);
  });

  it("returns 403 when the caller isn't this report's manager", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const otherManager = await createUser({ role: "MANAGER" });
    const report = await createUser({ managerId: otherManager.id });
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .post(`/api/v1/manager/requests/${req1.id}/approve`)
      .set(authHeader(manager.id, "MANAGER"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-pending request", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const report = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
      status: "REJECTED",
    });

    const res = await request(app)
      .post(`/api/v1/manager/requests/${req1.id}/approve`)
      .set(authHeader(manager.id, "MANAGER"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the balance is insufficient", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const report = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();
    await createLeaveBalance({
      userId: report.id,
      leaveTypeId: leaveType.id,
      allocatedDays: 1,
      usedDays: 0,
    });
    const req1 = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 23),
      daysRequested: 3,
    });

    const res = await request(app)
      .post(`/api/v1/manager/requests/${req1.id}/approve`)
      .set(authHeader(manager.id, "MANAGER"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no balance row exists", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const report = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .post(`/api/v1/manager/requests/${req1.id}/approve`)
      .set(authHeader(manager.id, "MANAGER"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown id", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const res = await request(app)
      .post("/api/v1/manager/requests/999999/approve")
      .set(authHeader(manager.id, "MANAGER"));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/manager/requests/:id/reject", () => {
  it("rejects a pending request with a reason", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const report = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .post(`/api/v1/manager/requests/${req1.id}/reject`)
      .set(authHeader(manager.id, "MANAGER"))
      .send({ reason: "no coverage" });

    expect(res.status).toBe(200);

    const decisions = await prisma.leaveDecision.findMany({
      where: { requestId: req1.id },
    });
    expect(decisions[0].action).toBe("REJECTED");
    expect(decisions[0].reason).toBe("no coverage");
  });

  it("returns 400 for a missing/blank reason", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const report = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .post(`/api/v1/manager/requests/${req1.id}/reject`)
      .set(authHeader(manager.id, "MANAGER"))
      .send({ reason: "   " });
    expect(res.status).toBe(400);
  });

  it("returns 403 when the caller isn't this report's manager", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const otherManager = await createUser({ role: "MANAGER" });
    const report = await createUser({ managerId: otherManager.id });
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const res = await request(app)
      .post(`/api/v1/manager/requests/${req1.id}/reject`)
      .set(authHeader(manager.id, "MANAGER"))
      .send({ reason: "no coverage" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-pending request", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const report = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();
    const req1 = await createLeaveRequest({
      userId: report.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
      status: "APPROVED",
    });

    const res = await request(app)
      .post(`/api/v1/manager/requests/${req1.id}/reject`)
      .set(authHeader(manager.id, "MANAGER"))
      .send({ reason: "no coverage" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown id", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const res = await request(app)
      .post("/api/v1/manager/requests/999999/reject")
      .set(authHeader(manager.id, "MANAGER"))
      .send({ reason: "no coverage" });
    expect(res.status).toBe(404);
  });
});
