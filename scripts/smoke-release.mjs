const [apiBaseRaw, webUrlRaw] = process.argv.slice(2);

if (!apiBaseRaw || !webUrlRaw) {
  console.error("Usage: node scripts/smoke-release.mjs <api-base-url> <web-url>");
  process.exit(2);
}

const apiBase = apiBaseRaw.replace(/\/$/, "");
const webUrl = webUrlRaw.replace(/\/$/, "");
const failures = [];

const check = async (name, run) => {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : error}`);
    console.error(`FAIL ${name}`);
  }
};

const requireOk = async (url, options) => {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
};

await check("API liveness", async () => {
  const response = await requireOk(`${apiBase}/health`);
  const body = await response.json();
  if (body.status !== "OK") throw new Error("unexpected health payload");
  if (!body.release || body.release === "development") {
    throw new Error("release identifier is missing");
  }
  if (!response.headers.get("x-request-id")) throw new Error("request id is missing");
});

await check("API database readiness", async () => {
  const response = await requireOk(`${apiBase}/health/ready`);
  const body = await response.json();
  if (body.status !== "READY" || body.checks?.database !== "up") {
    throw new Error("database is not ready");
  }
});

await check("Web shell", async () => {
  const response = await requireOk(webUrl);
  const html = await response.text();
  if (!/<div id=["']root["']/.test(html)) throw new Error("React root is missing");
});

await check("CORS policy", async () => {
  const response = await fetch(`${apiBase}/health`, {
    method: "OPTIONS",
    headers: {
      Origin: webUrl,
      "Access-Control-Request-Method": "GET",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (response.headers.get("access-control-allow-origin") !== webUrl) {
    throw new Error("web origin is not allowed");
  }
});

if (failures.length > 0) {
  console.error("\nRelease smoke test failed:\n" + failures.map((item) => `  - ${item}`).join("\n"));
  process.exit(1);
}

console.log("\nRelease smoke test passed.");
