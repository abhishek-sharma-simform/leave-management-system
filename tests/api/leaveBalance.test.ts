import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.ts";
import { resetDb } from "../helpers/testDb.ts";
import {
  createUser,
  createLeaveType,
  createLeaveBalance,
} from "../helpers/factories.ts";
import { authHeader } from "../helpers/authToken.ts";

beforeEach(async () => {
  await resetDb();
});

describe("GET /api/v1/leave-balances/me", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/v1/leave-balances/me");
    expect(res.status).toBe(401);
  });

  it("returns the caller's balances with computed remainingDays", async () => {
    const employee = await createUser();
    const leaveType = await createLeaveType({ name: "Casual Leave" });
    const year = new Date().getFullYear();
    await createLeaveBalance({
      userId: employee.id,
      leaveTypeId: leaveType.id,
      year,
      allocatedDays: 12,
      usedDays: 4,
    });

    const res = await request(app)
      .get("/api/v1/leave-balances/me")
      .set(authHeader(employee.id, "EMPLOYEE"));

    expect(res.status).toBe(200);
    expect(res.body.year).toBe(year);
    expect(res.body.balances).toEqual([
      {
        leaveTypeId: leaveType.id,
        leaveTypeName: "Casual Leave",
        allocatedDays: 12,
        usedDays: 4,
        remainingDays: 8,
      },
    ]);
  });

  it("returns an empty array for a manager with no balance rows (not an error)", async () => {
    const manager = await createUser({ role: "MANAGER" });

    const res = await request(app)
      .get("/api/v1/leave-balances/me")
      .set(authHeader(manager.id, "MANAGER"));

    expect(res.status).toBe(200);
    expect(res.body.balances).toEqual([]);
  });

  it("defaults year to the current year when omitted", async () => {
    const employee = await createUser();
    const res = await request(app)
      .get("/api/v1/leave-balances/me")
      .set(authHeader(employee.id, "EMPLOYEE"));

    expect(res.status).toBe(200);
    expect(res.body.year).toBe(new Date().getFullYear());
  });

  it("rejects a year outside the valid range with 400", async () => {
    const employee = await createUser();
    const res = await request(app)
      .get("/api/v1/leave-balances/me?year=1900")
      .set(authHeader(employee.id, "EMPLOYEE"));

    expect(res.status).toBe(400);
  });
});
