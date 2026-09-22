import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.ts";
import { resetDb } from "../helpers/testDb.ts";
import { createUser } from "../helpers/factories.ts";
import { authHeader } from "../helpers/authToken.ts";

beforeEach(async () => {
  await resetDb();
});

describe("POST /api/v1/auth/login", () => {
  it("logs in a seeded user and returns a token", async () => {
    const user = await createUser({
      email: "login-user@example.com",
      password: "Correct@123",
    });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "Correct@123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.email).toBe(user.email);
  });

  it("rejects a wrong password with 401", async () => {
    const user = await createUser({
      email: "wrong-pw@example.com",
      password: "Correct@123",
    });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "WrongPassword" });

    expect(res.status).toBe(401);
  });

  it("rejects an unknown email with 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: "whatever" });

    expect(res.status).toBe(401);
  });

  it("rejects a missing email/password with 400", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({});
    expect(res.status).toBe(400);
  });

  it("rejects a non-string email/password with 400", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: 123, password: 456 });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/auth/protected-test", () => {
  it("returns 401 with no token", async () => {
    const res = await request(app).get("/api/v1/auth/protected-test");
    expect(res.status).toBe(401);
  });

  it("returns 401 with an invalid token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/protected-test")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns 403 for an EMPLOYEE token", async () => {
    const employee = await createUser({ role: "EMPLOYEE" });
    const res = await request(app)
      .get("/api/v1/auth/protected-test")
      .set(authHeader(employee.id, "EMPLOYEE"));
    expect(res.status).toBe(403);
  });

  it("returns 200 with the caller's user for a MANAGER token", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const res = await request(app)
      .get("/api/v1/auth/protected-test")
      .set(authHeader(manager.id, "MANAGER"));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(manager.id);
  });
});
