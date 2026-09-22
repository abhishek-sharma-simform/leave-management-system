import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.ts";
import { resetDb } from "../helpers/testDb.ts";
import { createUser, createLeaveType } from "../helpers/factories.ts";
import { authHeader } from "../helpers/authToken.ts";

beforeEach(async () => {
  await resetDb();
});

describe("GET /api/v1/leave-types", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/v1/leave-types");
    expect(res.status).toBe(401);
  });

  it("returns leave types for an EMPLOYEE", async () => {
    const employee = await createUser({ role: "EMPLOYEE" });
    await createLeaveType({ name: "Casual Leave" });

    const res = await request(app)
      .get("/api/v1/leave-types")
      .set(authHeader(employee.id, "EMPLOYEE"));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("returns leave types for a MANAGER (no role gate)", async () => {
    const manager = await createUser({ role: "MANAGER" });
    await createLeaveType({ name: "Casual Leave" });

    const res = await request(app)
      .get("/api/v1/leave-types")
      .set(authHeader(manager.id, "MANAGER"));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
