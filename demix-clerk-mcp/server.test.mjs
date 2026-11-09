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

    const authorizationMetadata = await fetch(`${BASE}/.well-known/oauth-authorization-server`);
    assert.equal(authorizationMetadata.status, 200);
    const authorizationMetadataBody = await authorizationMetadata.json();
    assert.equal(authorizationMetadataBody.issuer, "https://glorious-husky-5726.clerk.accounts.dev");
    assert.ok(authorizationMetadataBody.authorization_endpoint?.includes("/oauth/authorize"));
    assert.ok(authorizationMetadataBody.token_endpoint?.includes("/oauth/token"));

    const clientMetadataResponse = await fetch(`${BASE}/.well-known/oauth-client-metadata.json`, {
      headers: { "x-forwarded-proto": "https" },
    });
    assert.equal(clientMetadataResponse.status, 200);
    assert.match(clientMetadataResponse.headers.get("content-type") || "", /application\/json/i);
    const clientMetadata = await clientMetadataResponse.json();
    assert.equal(clientMetadata.client_id, `https://${new URL(BASE).host}/.well-known/oauth-client-metadata.json`);
    assert.equal(clientMetadata.token_endpoint_auth_method, "none");
    assert.deepEqual(clientMetadata.redirect_uris, [
      "http://127.0.0.1:6274/oauth/callback",
      "http://localhost:6274/oauth/callback",
    ]);
    assert.deepEqual(clientMetadata.grant_types, ["authorization_code", "refresh_token"]);
    assert.deepEqual(clientMetadata.response_types, ["code"]);

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

test("public health and CIMD metadata work without Clerk secrets while MCP fails closed", async () => {
  const port = 18788;
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
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
        const response = await fetch(`${base}/health`);
        if (response.status === 200) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, `Server did not become ready: ${output}`);

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);

    const metadataResponse = await fetch(`${base}/.well-known/oauth-client-metadata.json`, {
      headers: { "x-forwarded-proto": "https" },
    });
    assert.equal(metadataResponse.status, 200);
    assert.match(metadataResponse.headers.get("content-type") || "", /application\\/json/i);
    const metadata = await metadataResponse.json();
    assert.equal(metadata.client_id, `https://${new URL(base).host}/.well-known/oauth-client-metadata.json`);

    const protectedResponse = await fetch(`${base}/mcp`);
    assert.equal(protectedResponse.status, 503);
    assert.equal((await protectedResponse.json()).error, "authentication_not_configured");
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
});
