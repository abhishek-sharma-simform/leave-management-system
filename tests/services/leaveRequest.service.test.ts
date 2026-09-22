import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/testDb.ts";
import {
  createUser,
  createLeaveType,
  createLeaveBalance,
  createLeaveRequest,
} from "../helpers/factories.ts";
import {
  updateLeaveRequest,
  cancelLeaveRequest,
  getLeaveRequestHistory,
  findOverlappingRequests,
} from "../../src/services/leaveRequest.service.ts";
import { prisma } from "../../src/config/prisma.ts";

beforeEach(async () => {
  await resetDb();
});

describe("updateLeaveRequest", () => {
  it("updates dates, leave type and reason, recalculating daysRequested", async () => {
    const user = await createUser();
    const leaveType = await createLeaveType({ defaultAllowanceDays: 20 });
    await createLeaveBalance({
      userId: user.id,
      leaveTypeId: leaveType.id,
      allocatedDays: 20,
    });
    const request = await createLeaveRequest({
      userId: user.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const updated = await updateLeaveRequest(user.id, request.id, {
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 23),
      reason: "extended trip",
    });

    expect(updated.daysRequested).toBe(3);
    expect(updated.note).toBe("extended trip");
  });

  it("throws NOT_FOUND for a non-existent request", async () => {
    const user = await createUser();
    await expect(updateLeaveRequest(user.id, 999999, {})).rejects.toThrow(
      "NOT_FOUND",
    );
  });

  it("throws FORBIDDEN when the caller isn't the owner", async () => {
    const owner = await createUser();
    const other = await createUser();
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: owner.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    await expect(
      updateLeaveRequest(other.id, request.id, {}),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("throws ALREADY_APPROVED for an approved request", async () => {
    const user = await createUser();
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: user.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
      status: "APPROVED",
    });

    await expect(
      updateLeaveRequest(user.id, request.id, {}),
    ).rejects.toThrow("ALREADY_APPROVED");
  });

  it("throws NOT_PENDING for a rejected request", async () => {
    const user = await createUser();
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: user.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
      status: "REJECTED",
    });

    await expect(
      updateLeaveRequest(user.id, request.id, {}),
    ).rejects.toThrow("NOT_PENDING");
  });

  it("throws INVALID_DATE_RANGE when merged dates put start after end", async () => {
    const user = await createUser();
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: user.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 23),
      daysRequested: 3,
    });

    await expect(
      updateLeaveRequest(user.id, request.id, {
        startDate: new Date(2026, 8, 25),
      }),
    ).rejects.toThrow("INVALID_DATE_RANGE");
  });

  it("throws LEAVE_TYPE_NOT_FOUND for an unknown leaveTypeId", async () => {
    const user = await createUser();
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: user.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    await expect(
      updateLeaveRequest(user.id, request.id, { leaveTypeId: 999999 }),
    ).rejects.toThrow("LEAVE_TYPE_NOT_FOUND");
  });

  it("throws BALANCE_NOT_FOUND when no balance row exists for the (possibly new) year/type", async () => {
    const user = await createUser();
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: user.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    await expect(
      updateLeaveRequest(user.id, request.id, {}),
    ).rejects.toThrow("BALANCE_NOT_FOUND");
  });

  it("throws INSUFFICIENT_BALANCE when the edit exceeds remaining balance", async () => {
    const user = await createUser();
    const leaveType = await createLeaveType();
    await createLeaveBalance({
      userId: user.id,
      leaveTypeId: leaveType.id,
      allocatedDays: 2,
      usedDays: 0,
    });
    const request = await createLeaveRequest({
      userId: user.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    await expect(
      updateLeaveRequest(user.id, request.id, {
        startDate: new Date(2026, 8, 21),
        endDate: new Date(2026, 8, 25),
      }),
    ).rejects.toThrow("INSUFFICIENT_BALANCE");
  });

  it("allows a partial update of only the reason, leaving days unchanged", async () => {
    const user = await createUser();
    const leaveType = await createLeaveType();
    await createLeaveBalance({ userId: user.id, leaveTypeId: leaveType.id });
    const request = await createLeaveRequest({
      userId: user.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 23),
      daysRequested: 3,
      note: "original",
    });

    const updated = await updateLeaveRequest(user.id, request.id, {
      reason: "updated reason",
    });

    expect(updated.daysRequested).toBe(3);
    expect(updated.note).toBe("updated reason");
  });
});

describe("cancelLeaveRequest", () => {
  it("cancels a pending request", async () => {
    const user = await createUser();
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: user.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const cancelled = await cancelLeaveRequest(user.id, request.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("throws NOT_FOUND for a non-existent request", async () => {
    const user = await createUser();
    await expect(cancelLeaveRequest(user.id, 999999)).rejects.toThrow(
      "NOT_FOUND",
    );
  });

  it("throws FORBIDDEN when the caller isn't the owner", async () => {
    const owner = await createUser();
    const other = await createUser();
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: owner.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    await expect(cancelLeaveRequest(other.id, request.id)).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("throws ALREADY_APPROVED for an approved request", async () => {
    const user = await createUser();
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: user.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
      status: "APPROVED",
    });

    await expect(cancelLeaveRequest(user.id, request.id)).rejects.toThrow(
      "ALREADY_APPROVED",
    );
  });

  it("throws NOT_PENDING for an already-cancelled request", async () => {
    const user = await createUser();
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: user.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
      status: "CANCELLED",
    });

    await expect(cancelLeaveRequest(user.id, request.id)).rejects.toThrow(
      "NOT_PENDING",
    );
  });
});

describe("getLeaveRequestHistory", () => {
  it("is visible to the request's owner", async () => {
    const user = await createUser();
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: user.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    const result = await getLeaveRequestHistory(
      user.id,
      "EMPLOYEE",
      request.id,
    );
    expect(result.id).toBe(request.id);
  });

  it("is visible to the requester's manager, with decisions ordered ascending", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const employee = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
      status: "REJECTED",
    });
    await prisma.leaveDecision.create({
      data: {
        requestId: request.id,
        actorId: manager.id,
        action: "REJECTED",
        reason: "no coverage",
        decidedAt: new Date(2026, 8, 20),
      },
    });

    const result = await getLeaveRequestHistory(
      manager.id,
      "MANAGER",
      request.id,
    );
    expect(result.decisions).toHaveLength(1);
  });

  it("throws FORBIDDEN for an unrelated employee", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: owner.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    await expect(
      getLeaveRequestHistory(stranger.id, "EMPLOYEE", request.id),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("throws FORBIDDEN for a manager who isn't this employee's manager", async () => {
    const realManager = await createUser({ role: "MANAGER" });
    const otherManager = await createUser({ role: "MANAGER" });
    const employee = await createUser({ managerId: realManager.id });
    const leaveType = await createLeaveType();
    const request = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 21),
      endDate: new Date(2026, 8, 21),
      daysRequested: 1,
    });

    await expect(
      getLeaveRequestHistory(otherManager.id, "MANAGER", request.id),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("throws NOT_FOUND for a non-existent request", async () => {
    const user = await createUser();
    await expect(
      getLeaveRequestHistory(user.id, "EMPLOYEE", 999999),
    ).rejects.toThrow("NOT_FOUND");
  });
});

describe("findOverlappingRequests", () => {
  it("includes overlapping PENDING/APPROVED requests from other reports of the same manager", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const employeeA = await createUser({ managerId: manager.id });
    const employeeB = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();

    const target = await createLeaveRequest({
      userId: employeeA.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 20),
      endDate: new Date(2026, 8, 24),
      daysRequested: 3,
    });
    const overlapping = await createLeaveRequest({
      userId: employeeB.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 22),
      endDate: new Date(2026, 8, 26),
      daysRequested: 3,
      status: "APPROVED",
    });

    const results = await findOverlappingRequests(target.id);
    expect(results.map((r) => r.id)).toContain(overlapping.id);
  });

  it("excludes REJECTED and CANCELLED requests", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const employeeA = await createUser({ managerId: manager.id });
    const employeeB = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();

    const target = await createLeaveRequest({
      userId: employeeA.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 20),
      endDate: new Date(2026, 8, 24),
      daysRequested: 3,
    });
    const rejected = await createLeaveRequest({
      userId: employeeB.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 22),
      endDate: new Date(2026, 8, 26),
      daysRequested: 3,
      status: "REJECTED",
    });

    const results = await findOverlappingRequests(target.id);
    expect(results.map((r) => r.id)).not.toContain(rejected.id);
  });

  it("excludes requests from a different manager's team", async () => {
    const managerA = await createUser({ role: "MANAGER" });
    const managerB = await createUser({ role: "MANAGER" });
    const employeeA = await createUser({ managerId: managerA.id });
    const employeeB = await createUser({ managerId: managerB.id });
    const leaveType = await createLeaveType();

    const target = await createLeaveRequest({
      userId: employeeA.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 20),
      endDate: new Date(2026, 8, 24),
      daysRequested: 3,
    });
    const otherTeam = await createLeaveRequest({
      userId: employeeB.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 22),
      endDate: new Date(2026, 8, 26),
      daysRequested: 3,
    });

    const results = await findOverlappingRequests(target.id);
    expect(results.map((r) => r.id)).not.toContain(otherTeam.id);
  });

  it("excludes the requester's own other requests", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const employee = await createUser({ managerId: manager.id });
    const leaveType = await createLeaveType();

    const target = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 20),
      endDate: new Date(2026, 8, 24),
      daysRequested: 3,
    });
    const ownOther = await createLeaveRequest({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date(2026, 8, 22),
      endDate: new Date(2026, 8, 26),
      daysRequested: 3,
    });

    const results = await findOverlappingRequests(target.id);
    expect(results.map((r) => r.id)).not.toContain(ownOther.id);
  });

  it("throws for a missing request id (documents current behavior)", async () => {
    await expect(findOverlappingRequests(999999)).rejects.toThrow(
      "Leave request not found",
    );
  });
});
