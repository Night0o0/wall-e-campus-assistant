import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/validate-production-env.mjs <environment-file>");
  process.exit(2);
}

const values = {};
for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator < 1) continue;
  values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
}

const required = [
  "RELEASE_SHA",
  "JWT_SECRET",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "DIRECT_URL",
  "CORS_ORIGINS",
  "MAIL_FROM",
  "SMTP_HOST",
];
const placeholder = /^(?:SET_|replace-me|your-|https:\/\/PROJECT|postgresql:\/\/user:password)/i;
const issues = [];

for (const key of required) {
  if (!values[key]) issues.push(`${key} is missing`);
  else if (placeholder.test(values[key])) issues.push(`${key} still contains a placeholder`);
}

if (values.NODE_ENV !== "production") issues.push("NODE_ENV must be production");
if (values.AUTH_PROVIDER !== "supabase") issues.push("AUTH_PROVIDER must be supabase");
if (values.MAIL_PROVIDER !== "smtp") issues.push("MAIL_PROVIDER must be smtp");
if (values.NOTIFICATION_DEV_TOOLS !== "false") {
  issues.push("NOTIFICATION_DEV_TOOLS must be false");
}
if ((values.JWT_SECRET ?? "").length < 32) {
  issues.push("JWT_SECRET must contain at least 32 characters");
}
for (const origin of (values.CORS_ORIGINS ?? "").split(",").filter(Boolean)) {
  if (!origin.trim().startsWith("https://")) {
    issues.push("every CORS_ORIGINS entry must use HTTPS");
    break;
  }
}
if (values.SMTP_SECURE !== "true" && values.SMTP_REQUIRE_TLS !== "true") {
  issues.push("SMTP must use implicit TLS or require STARTTLS");
}

if (issues.length > 0) {
  console.error(
    `Production environment validation failed:\n${issues
      .map((issue) => `  - ${issue}`)
      .join("\n")}`
  );
  process.exit(1);
}

console.log(`Production environment validation passed (${path}).`);
