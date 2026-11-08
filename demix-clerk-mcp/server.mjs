import http from "node:http";
import { createClerkClient } from "@clerk/backend";
import {
  verifyClerkToken,
  generateClerkProtectedResourceMetadata,
  fetchClerkAuthorizationServerMetadata,
} from "@clerk/mcp-tools/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.PORT || 8787);
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;
const MCP_RESOURCE_URL = process.env.MCP_RESOURCE_URL || "http://localhost:8787/mcp";
const RESOURCE_METADATA_URL = new URL("/.well-known/oauth-protected-resource/mcp", MCP_RESOURCE_URL).href;
const ADMIN_USER_IDS = new Set((process.env.DEMIX_ADMIN_USER_IDS || "").split(",").map(v => v.trim()).filter(Boolean));
const CLERK_API_BASE = "https://api.clerk.com/v1";

if (!CLERK_SECRET_KEY || !CLERK_SECRET_KEY.startsWith("sk_")) {
  console.error("Missing/invalid CLERK_SECRET_KEY. Set it in your local environment.");
  process.exit(1);
}
if (!CLERK_PUBLISHABLE_KEY || !CLERK_PUBLISHABLE_KEY.startsWith("pk_")) {
  console.error("Missing/invalid CLERK_PUBLISHABLE_KEY. Set it in your local environment.");
  process.exit(1);
}
if (ADMIN_USER_IDS.size === 0) {
  console.error("DEMIX_ADMIN_USER_IDS is required. Add the approved Clerk admin user ID locally.");
  process.exit(1);
}
if (new URL(MCP_RESOURCE_URL).pathname !== "/mcp") {
  console.error("MCP_RESOURCE_URL must identify the exact /mcp endpoint.");
  process.exit(1);
}

const clerkClient = createClerkClient({
  secretKey: CLERK_SECRET_KEY,
  publishableKey: CLERK_PUBLISHABLE_KEY,
});

async function verifyMcpRequest(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ") || authorization.length <= 7) return { status: 401 };

  try {
    const clerkRequest = new Request(MCP_RESOURCE_URL, {
      method: "GET",
      headers: { authorization },
    });
    const requestState = await clerkClient.authenticateRequest(clerkRequest, {
      acceptsToken: "oauth_token",
      audience: MCP_RESOURCE_URL,
    });
    if (!requestState.isAuthenticated) return { status: 401 };

    const authInfo = verifyClerkToken(requestState.toAuth(), requestState.token);
    const userId = authInfo?.extra?.userId;
    if (typeof userId !== "string" || !userId) return { status: 401 };
    if (!ADMIN_USER_IDS.has(userId)) return { status: 403 };
    return { status: 200, authInfo };
  } catch (error) {
    console.error("Clerk OAuth verification failed:", error?.message || "unknown error");
    return { status: 401 };
  }
}

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function sendMetadata(res, body) {
  sendJson(res, 200, body, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "*",
    "access-control-max-age": "86400",
  });
}

async function clerk(path, params = {}) {
  const url = new URL(`${CLERK_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      if (Array.isArray(value)) value.forEach(v => url.searchParams.append(key, v));
      else url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.errors?.[0]?.message || `Clerk API returned HTTP ${response.status}`;
    throw new Error(`${message} (HTTP ${response.status})`);
  }
  return body;
}

function pickUser(u) {
  return {
    id: u.id,
    first_name: u.first_name ?? null,
    last_name: u.last_name ?? null,
    username: u.username ?? null,
    primary_email_address_id: u.primary_email_address_id ?? null,
    email_addresses: (u.email_addresses || []).map(e => ({
      id: e.id,
      email_address: e.email_address,
      verification_status: e.verification?.status ?? null,
    })),
    created_at: u.created_at ?? null,
    updated_at: u.updated_at ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    banned: u.banned ?? false,
    locked: u.locked ?? false,
    public_metadata: {
      demixInvitationId: u.public_metadata?.demixInvitationId ?? null,
    },
  };
}

function pickInvitation(i) {
  return {
    id: i.id,
    email_address: i.email_address,
    status: i.status ?? null,
    created_at: i.created_at ?? null,
    expires_at: i.expires_at ?? null,
    public_metadata: {
      demixInvitationId: i.public_metadata?.demixInvitationId ?? null,
    },
  };
}

function createMcpServer() {
  const server = new McpServer({
    name: "demix-clerk-admin",
    version: "0.1.0",
  });

  server.registerTool(
    "clerk_connection_check",
    {
      title: "Check Clerk connection",
      description: "Read-only check that the configured Clerk secret key is valid and identify the Clerk instance from a minimal users request.",
      inputSchema: {},
    },
    async () => {
      const result = await clerk("/users", { limit: 1, offset: 0 });
      return {
        content: [{ type: "text", text: JSON.stringify({
          connected: true,
          returnedUsers: Array.isArray(result) ? result.length : 0,
          api: "Clerk Backend API v1",
          mode: "read-only",
        }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "clerk_list_users",
    {
      title: "List Clerk users",
      description: "Read-only. List users with a small safe subset of fields. Does not expose secret/private metadata.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).max(5000).optional(),
        email: z.string().email().optional(),
      },
    },
    async ({ limit = 20, offset = 0, email }) => {
      const params = { limit, offset };
      if (email) params["email_address"] = [email];
      const result = await clerk("/users", params);
      return { content: [{ type: "text", text: JSON.stringify((result || []).map(pickUser), null, 2) }] };
    }
  );

  server.registerTool(
    "clerk_get_user",
    {
      title: "Get Clerk user",
      description: "Read-only. Retrieve one Clerk user by exact Clerk user ID.",
      inputSchema: { user_id: z.string().min(5).max(128) },
    },
    async ({ user_id }) => {
      const result = await clerk(`/users/${encodeURIComponent(user_id)}`);
      return { content: [{ type: "text", text: JSON.stringify(pickUser(result), null, 2) }] };
    }
  );

  server.registerTool(
    "clerk_list_invitations",
    {
      title: "List Clerk invitations",
      description: "Read-only. List Clerk invitations and their status. No invitation is created, revoked, or modified.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).max(5000).optional(),
        status: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
      },
    },
    async ({ limit = 20, offset = 0, status }) => {
      const result = await clerk("/invitations", { limit, offset, status });
      return { content: [{ type: "text", text: JSON.stringify((result || []).map(pickInvitation), null, 2) }] };
    }
  );

  server.registerTool(
    "clerk_get_invitation",
    {
      title: "Get Clerk invitation",
      description: "Read-only. Retrieve one Clerk invitation by exact invitation ID.",
      inputSchema: { invitation_id: z.string().min(5).max(128) },
    },
    async ({ invitation_id }) => {
      const result = await clerk(`/invitations/${encodeURIComponent(invitation_id)}`);
      return { content: [{ type: "text", text: JSON.stringify(pickInvitation(result), null, 2) }] };
    }
  );

  return server;
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "demix-clerk-mcp", mode: "read-only" }));
    return;
  }

  if (url.pathname === "/.well-known/oauth-protected-resource/mcp" || url.pathname === "/.well-known/oauth-protected-resource") {
    if (req.method === "OPTIONS") return sendMetadata(res, {});
    if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "GET, OPTIONS" });
    try {
      const metadata = generateClerkProtectedResourceMetadata({
        publishableKey: CLERK_PUBLISHABLE_KEY,
        resourceUrl: MCP_RESOURCE_URL,
      });
      return sendMetadata(res, metadata);
    } catch (error) {
      console.error("Protected resource metadata failed:", error?.message || "unknown error");
      return sendJson(res, 500, { error: "metadata_unavailable" });
    }
  }

  if (url.pathname === "/.well-known/oauth-authorization-server") {
    if (req.method === "OPTIONS") return sendMetadata(res, {});
    if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "GET, OPTIONS" });
    try {
      const metadata = await fetchClerkAuthorizationServerMetadata({ publishableKey: CLERK_PUBLISHABLE_KEY });
      return sendMetadata(res, metadata);
    } catch (error) {
      console.error("Authorization server metadata failed:", error?.message || "unknown error");
      return sendJson(res, 502, { error: "authorization_metadata_unavailable" });
    }
  }

  if (url.pathname !== "/mcp") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  if (!["POST", "GET", "DELETE"].includes(req.method || "")) {
    res.writeHead(405, { Allow: "POST, GET, DELETE" });
    res.end("Method not allowed");
    return;
  }

  const authResult = await verifyMcpRequest(req);
  if (authResult.status === 401) {
    return sendJson(res, 401, { error: "invalid_token" }, {
      "www-authenticate": `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`,
    });
  }
  if (authResult.status === 403) {
    return sendJson(res, 403, { error: "admin_only" });
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer();

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("MCP request failed:", error?.message || "unknown error");
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "MCP request failed" }));
    }
  } finally {
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  }
});

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`DeMix Clerk MCP listening on http://127.0.0.1:${PORT}`);
  console.log("Clerk OAuth enabled. Admin allowlist enforced. Read-only tools only.");
});
