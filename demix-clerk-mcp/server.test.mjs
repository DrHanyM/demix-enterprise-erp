import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const PORT = 18787;
const BASE = `http://127.0.0.1:${PORT}`;
const resourceUrl = `http://localhost:${PORT}/mcp`;
const publishableDomain = Buffer.from("glorious-husky-5726.clerk.accounts.dev$").toString("base64url");

test("HTTP server starts and protects the real MCP route without modifying preview", async () => {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: {
      ...process.env,
      PORT: String(PORT),
      MCP_RESOURCE_URL: resourceUrl,
      CLERK_SECRET_KEY: "sk_test_local_ci_placeholder",
      CLERK_PUBLISHABLE_KEY: `pk_test_${publishableDomain}`,
      DEMIX_ADMIN_USER_ID: "user_3Lg5WNRTzqqhUihdy8EjcLBwuo1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });

  try {
    const deadline = Date.now() + 10000;
    let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Server exited early: ${output}`);
      try {
        const response = await fetch(`${BASE}/health`);
        if (response.status === 200) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, `Server did not become ready: ${output}`);

    const health = await fetch(`${BASE}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, "ok");

    const metadata = await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`);
    assert.equal(metadata.status, 200);
    const metadataBody = await metadata.json();
    assert.equal(metadataBody.resource, resourceUrl);
    assert.deepEqual(metadataBody.authorization_servers, ["https://glorious-husky-5726.clerk.accounts.dev"]);

    const missingToken = await fetch(`${BASE}/mcp`);
    assert.equal(missingToken.status, 401);
    assert.match(missingToken.headers.get("www-authenticate") || "", /oauth-protected-resource/);

    const notFound = await fetch(`${BASE}/not-mcp`);
    assert.equal(notFound.status, 404);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
});
