import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" }
)
  .split("\0")
  .filter(Boolean);

const forbiddenFiles = [
  /(^|\/)\.env(?:\.|$)/i,
  /google-services\.json$/i,
  /\.(?:jks|keystore|p12|pfx|pem)$/i,
];

const signatures = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: "Supabase secret key", pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
];

const findings = [];

for (const file of tracked) {
  const isExampleEnvironment = /\.env(?:\..*)?\.example$|\.env\.example$/i.test(file);
  if (!isExampleEnvironment && forbiddenFiles.some((pattern) => pattern.test(file))) {
    findings.push(`${file}: credential-bearing file type is tracked`);
    continue;
  }

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const signature of signatures) {
    if (signature.pattern.test(content)) {
      findings.push(`${file}: possible ${signature.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed:\n" + findings.map((item) => `  - ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Secret scan passed (${tracked.length} repository files checked).`);
