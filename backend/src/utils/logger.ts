import { env } from "../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const sensitiveKey = /authorization|cookie|password|secret|token|key|code/i;

const safeValue = (key: string, value: unknown): unknown => {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: env.isProduction ? "Unexpected error" : value.message,
      stack: env.isProduction ? undefined : value.stack,
      code:
        "code" in value && typeof value.code === "string"
          ? value.code
          : undefined,
    };
  }
  return value;
};

const sanitize = (fields: LogFields): LogFields =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, safeValue(key, value)])
  );

const write = (level: LogLevel, event: string, fields: LogFields = {}) => {
  if (priorities[level] < priorities[env.LOG_LEVEL]) return;

  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "leornian-api",
    version: env.APP_VERSION,
    release: env.RELEASE_SHA,
    ...sanitize(fields),
  });

  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
};

export const logger = {
  debug: (event: string, fields?: LogFields) => write("debug", event, fields),
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};

export const sanitizeLogFields = sanitize;
