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
import { resolveReleaseSha } from "../src/config/env.js";
import { sanitizeLogFields } from "../src/utils/logger.js";

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

  it("redacts credentials from structured log fields", () => {
    expect(
      sanitizeLogFields({
        requestId: "safe-id",
        authorization: "Bearer secret",
        password: "do-not-log",
      })
    ).toEqual({
      requestId: "safe-id",
      authorization: "[REDACTED]",
      password: "[REDACTED]",
    });
  });
});

describe("release identity resolution", () => {
  it("prefers an explicitly configured RELEASE_SHA", () => {
    expect(
      resolveReleaseSha({ RELEASE_SHA: "abc123", RENDER_GIT_COMMIT: "def456" })
    ).toBe("abc123");
  });

  it("falls back to the platform-injected commit", () => {
    expect(resolveReleaseSha({ RENDER_GIT_COMMIT: "def456" })).toBe("def456");
  });

  it("treats a blank RELEASE_SHA as unset so the fallback still applies", () => {
    expect(
      resolveReleaseSha({ RELEASE_SHA: "   ", RENDER_GIT_COMMIT: "def456" })
    ).toBe("def456");
  });

  it("trims surrounding whitespace from either source", () => {
    expect(resolveReleaseSha({ RELEASE_SHA: " abc123\n" })).toBe("abc123");
    expect(resolveReleaseSha({ RENDER_GIT_COMMIT: " def456 " })).toBe("def456");
  });

  it("resolves to undefined when neither is set, leaving the schema default", () => {
    expect(resolveReleaseSha({})).toBeUndefined();
    expect(resolveReleaseSha({ RELEASE_SHA: "", RENDER_GIT_COMMIT: "" })).toBeUndefined();
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

  it("returns and accepts safe request correlation ids", async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { "x-request-id": "release-smoke-42" },
    });
    expect(response.headers.get("x-request-id")).toBe("release-smoke-42");
  });

  it("replaces unsafe request correlation ids", async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { "x-request-id": "unsafe id with spaces" },
    });
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
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
