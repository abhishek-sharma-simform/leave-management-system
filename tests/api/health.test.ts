import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app.ts";

describe("GET /api/v1/health", () => {
  it("returns 200 ok", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
  });
});
