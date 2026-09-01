import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { resolveError } from "../src/middleware/error.middleware.js";
import { validateUuidParam } from "../src/middleware/validate.middleware.js";
import { materialQuerySchema } from "../src/types/material.types.js";
import { metricsQuerySchema } from "../src/types/metrics.types.js";
import { scheduleAttendanceLogQuerySchema } from "../src/types/schedule.types.js";
import { AppError } from "../src/utils/AppError.js";

describe("request validation and stable errors", () => {
  it("rejects malformed UUID route parameters", () => {
    const next = vi.fn();
    validateUuidParam("id")({} as never, {} as never, next, "not-an-id", "id");
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ issues: expect.any(Array) }));
  });

  it("applies bounded defaults to operational queries", () => {
    expect(metricsQuerySchema.parse({})).toEqual({ months: 8 });
    expect(scheduleAttendanceLogQuerySchema.parse({})).toEqual({ weeks: 4 });
    expect(() => metricsQuerySchema.parse({ months: 25 })).toThrow();
    expect(() => scheduleAttendanceLogQuerySchema.parse({ weeks: 0 })).toThrow();
  });

  it("gives material lists pagination defaults", () => {
    expect(materialQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 10,
      sortOrder: "desc",
      status: "active",
    });
  });

  it("never exposes an unexpected exception message", () => {
    expect(resolveError(new Error("database password leaked here"))).toEqual({
      status: 500,
      body: { message: "Internal Server Error", code: "INTERNAL_SERVER_ERROR" },
    });
  });

  it("assigns a stable code to legacy AppErrors", () => {
    expect(resolveError(new AppError("No", 403))).toMatchObject({
      status: 403,
      body: { code: "FORBIDDEN" },
    });
  });
});

describe("public HTTP contract", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it("serves liveness without requiring the database", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "OK" });
  });

  it("returns a stable 404 contract", async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });

  it("returns INVALID_JSON for malformed request bodies", async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{broken",
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_JSON" });
  });
});
