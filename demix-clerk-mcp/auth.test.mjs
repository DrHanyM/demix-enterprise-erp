import test from "node:test";
import assert from "node:assert/strict";
import { createAdminAuthenticator } from "./auth.mjs";
import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";

const RESOURCE = "http://localhost:8787/mcp";
const ADMIN = "user_3Lg5WNRTzqqhUihdy8EjcLBwuo1";
const OTHER = "user_not_the_admin";

function makeRequest(token) {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} };
}

function makeHarness({ authenticated = true, userId = ADMIN, tokenType = "oauth_token", throwError = false } = {}) {
  const calls = [];
  const clerkClient = {
    async authenticateRequest(request, options) {
      calls.push({ request, options });
      if (throwError) throw new Error("expired or invalid token");
      return {
        isAuthenticated: authenticated,
        token: "test-access-token",
        toAuth: () => ({ isAuthenticated: authenticated, tokenType, userId, clientId: "test-client", scopes: ["profile"] }),
      };
    },
  };
  const verifyToken = (auth, token) => {
    if (!auth.isAuthenticated || auth.tokenType !== "oauth_token" || token !== "test-access-token") return undefined;
    return { token, clientId: auth.clientId, scopes: auth.scopes, extra: { userId: auth.userId, verifiedBy: "clerk" } };
  };
  return {
    calls,
    authenticate: createAdminAuthenticator({ clerkClient, resourceUrl: RESOURCE, adminUserId: ADMIN, verifyToken }),
  };
}

test("rejects missing bearer token without contacting Clerk", async () => {
  const h = makeHarness();
  assert.deepEqual(await h.authenticate(makeRequest()), { status: 401 });
  assert.equal(h.calls.length, 0);
});

test("accepts the verified administrator OAuth access token with exact resource audience", async () => {
  const h = makeHarness();
  const result = await h.authenticate(makeRequest("valid"));
  assert.equal(result.status, 200);
  assert.equal(result.authInfo.extra.userId, ADMIN);
  assert.equal(h.calls[0].options.acceptsToken, "oauth_token");
  assert.equal(h.calls[0].options.audience, RESOURCE);
  assert.equal(h.calls[0].request.url, RESOURCE);
});

test("rejects expired or otherwise unauthenticated OAuth tokens", async () => {
  const h = makeHarness({ authenticated: false });
  assert.deepEqual(await h.authenticate(makeRequest("expired")), { status: 401 });
});

test("rejects tokens that Clerk cannot validate for the exact resource audience", async () => {
  const h = makeHarness({ throwError: true });
  assert.deepEqual(await h.authenticate(makeRequest("wrong-audience")), { status: 401 });
});

test("rejects an authenticated non-administrator account", async () => {
  const h = makeHarness({ userId: OTHER });
  assert.deepEqual(await h.authenticate(makeRequest("valid-other-user")), { status: 403 });
});

test("rejects a session token even if a verifier returns no Clerk OAuth identity", async () => {
  const h = makeHarness({ tokenType: "session_token" });
  assert.deepEqual(await h.authenticate(makeRequest("session-token")), { status: 401 });
});

test("fails closed when Clerk identity is not marked as verified", async () => {
  const h = makeHarness();
  const authenticate = createAdminAuthenticator({
    clerkClient: {
      async authenticateRequest() {
        return { isAuthenticated: true, token: "untrusted", toAuth: () => ({}) };
      },
    },
    resourceUrl: RESOURCE,
    adminUserId: ADMIN,
    verifyToken: () => ({ extra: { userId: ADMIN, verifiedBy: "custom" } }),
  });
  assert.deepEqual(await authenticate(makeRequest("untrusted")), { status: 401 });
});

test("handles repeated and concurrent requests without sharing authentication state", async () => {
  const h = makeHarness();
  const results = await Promise.all(
    Array.from({ length: 24 }, (_, i) => h.authenticate(makeRequest(`parallel-${i}`))),
  );
  assert.equal(results.length, 24);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(h.calls.length, 24);
});

test("publishes protected-resource metadata for the exact MCP URL and Clerk issuer", () => {
  const encodedDomain = Buffer.from("glorious-husky-5726.clerk.accounts.dev$").toString("base64url");
  const metadata = generateClerkProtectedResourceMetadata({
    publishableKey: `pk_test_${encodedDomain}`,
    resourceUrl: RESOURCE,
  });
  assert.equal(metadata.resource, RESOURCE);
  assert.deepEqual(metadata.authorization_servers, ["https://glorious-husky-5726.clerk.accounts.dev"]);
  assert.ok(metadata.jwks_uri.startsWith("https://glorious-husky-5726.clerk.accounts.dev/"));
});
