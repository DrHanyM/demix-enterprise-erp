import http from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createClerkClient } from "@clerk/backend";
import { createAdminAuthenticator } from "./auth.mjs";
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
const DEMIX_ADMIN_USER_ID = process.env.DEMIX_ADMIN_USER_ID || "";
const CLERK_API_BASE = "https://api.clerk.com/v1";

if (new URL(MCP_RESOURCE_URL).pathname !== "/mcp") {
  console.error("MCP_RESOURCE_URL must identify the exact /mcp endpoint.");
  process.exit(1);
}

// Initialize Clerk credentials only when a protected MCP request arrives.
// Public health and OAuth client-metadata endpoints do not require server secrets.
let authenticateAdminRequest;
function getAdminAuthenticator() {
  if (!CLERK_SECRET_KEY || !CLERK_SECRET_KEY.startsWith("sk_")) {
    throw new Error("Missing/invalid CLERK_SECRET_KEY");
  }
  if (!CLERK_PUBLISHABLE_KEY || !CLERK_PUBLISHABLE_KEY.startsWith("pk_")) {
    throw new Error("Missing/invalid CLERK_PUBLISHABLE_KEY");
  }
  if (!DEMIX_ADMIN_USER_ID.startsWith("user_")) {
    throw new Error("DEMIX_ADMIN_USER_ID is not configured");
  }

  if (!authenticateAdminRequest) {
    const clerkClient = createClerkClient({
      secretKey: CLERK_SECRET_KEY,
      publishableKey: CLERK_PUBLISHABLE_KEY,
    });
    authenticateAdminRequest = createAdminAuthenticator({
      clerkClient,
      resourceUrl: MCP_RESOURCE_URL,
      adminUserId: DEMIX_ADMIN_USER_ID,
      verifyToken: verifyClerkToken,
      timeoutMs: Number(process.env.MCP_AUTH_TIMEOUT_MS || 8000),
    });
  }
  return authenticateAdminRequest;
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

export async function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/^\/api(?=\/)/, "");

  if (pathname === "/health" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "demix-clerk-mcp", mode: "read-only" }));
    return;
  }

  if (pathname === "/.well-known/oauth-protected-resource/mcp" || pathname === "/.well-known/oauth-protected-resource") {
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

  if (pathname === "/.well-known/oauth-authorization-server") {
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

  if (pathname === "/.well-known/oauth-client-metadata.json") {
    if (req.method === "OPTIONS") return sendMetadata(res, {});
    if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "GET, OPTIONS" });

    // Build the CIMD client_id from the public HTTPS host serving this document.
    // Vercel supplies x-forwarded-proto; Host identifies the requested deployment alias.
    const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    const host = String(req.headers.host || "").split(",")[0].trim();
    if (protocol !== "https" || !host) {
      return sendJson(res, 400, { error: "https_host_required" });
    }

    let clientId;
    try {
      const metadataUrl = new URL("/.well-known/oauth-client-metadata.json", `https://${host}`);
      if (metadataUrl.host !== host) throw new Error("Invalid host");
      clientId = metadataUrl.href;
    } catch {
      return sendJson(res, 400, { error: "invalid_host" });
    }

    return sendJson(res, 200, {
      client_id: clientId,
      client_name: "DeMix MCP Inspector",
      redirect_uris: [
        "http://127.0.0.1:6274/oauth/callback",
        "http://localhost:6274/oauth/callback"
      ],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      application_type: "native"
    }, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "*",
      "access-control-max-age": "86400",
      "cache-control": "public, max-age=300"
    });
  }

  if (pathname !== "/mcp") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }


  const requestId = req.headers["x-vercel-id"] || req.headers["x-request-id"] || "local";
  const hasBearerToken = (req.headers.authorization || "").startsWith("Bearer ");
  console.info("[mcp] request received", JSON.stringify({
    requestId,
    method: req.method,
    hasBearerToken,
    contentType: req.headers["content-type"] || null,
    contentLength: req.headers["content-length"] || null,
  }));

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
      "access-control-expose-headers": "mcp-session-id, www-authenticate",
      "access-control-max-age": "86400",
    });
    res.end();
    return;
  }

  if (!["POST", "GET", "DELETE"].includes(req.method || "")) {
    res.writeHead(405, { Allow: "POST, GET, DELETE, OPTIONS" });
    res.end("Method not allowed");
    return;
  }

  let authResult;
  try {
    authResult = await getAdminAuthenticator()(req);
  } catch (error) {
    console.error("[mcp] authentication configuration unavailable", JSON.stringify({
      requestId,
      message: typeof error?.message === "string" ? error.message.slice(0, 160) : "Authentication is not configured",
    }));
    return sendJson(res, 503, { error: "authentication_not_configured" }, {
      "retry-after": "30",
      "access-control-allow-origin": "*",
    });
  }
  console.info("[mcp] authentication completed", JSON.stringify({
    requestId,
    status: authResult.status,
  }));
  if (authResult.status === 401) {
    return sendJson(res, 401, { error: "invalid_token" }, {
      "www-authenticate": "Bearer resource_metadata=\"" + RESOURCE_METADATA_URL + "\"",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "www-authenticate",
    });
  }
  if (authResult.status === 403) {
    return sendJson(res, 403, { error: "admin_only" }, {
      "access-control-allow-origin": "*",
    });
  }
  if (authResult.status === 503) {
    return sendJson(res, 503, { error: "authentication_service_unavailable" }, {
      "retry-after": "5",
      "access-control-allow-origin": "*",
    });
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer();
  let stage = "server_connect";

  try {
    console.info("[mcp] connecting transport", JSON.stringify({ requestId }));
    await server.connect(transport);
    console.info("[mcp] transport connected", JSON.stringify({ requestId }));

    // Vercel Node Functions lazily populate req.body with a parsed body.
    // The MCP SDK accepts that parsed value as its third handleRequest arg;
    // omitting it makes the SDK try to consume an already-parsed request stream.
    stage = "read_parsed_body";
    const parsedBody = req.body;
    console.info("[mcp] dispatching MCP request", JSON.stringify({
      requestId,
      stage,
      hasParsedBody: parsedBody !== undefined && parsedBody !== null,
      parsedBodyType: parsedBody === null ? "null" : Array.isArray(parsedBody) ? "array" : typeof parsedBody,
    }));

    stage = "transport_handle_request";
    await transport.handleRequest(req, res, parsedBody);
    console.info("[mcp] request handled", JSON.stringify({ requestId }));
  } catch (error) {
    console.error("[mcp] request failed", JSON.stringify({
      requestId,
      stage,
      name: typeof error?.name === "string" ? error.name : "Error",
      message: typeof error?.message === "string" ? error.message.slice(0, 300) : "Unknown MCP error",
    }));
    if (!res.headersSent) {
      res.writeHead(500, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify({ error: "MCP request failed", stage }));
    }
  } finally {
    await Promise.allSettled([
      transport.close(),
      server.close(),
    ]);
  }
}

// Vercel's Node framework treats this file as the server entrypoint.
// Export the request handler explicitly for its serverless runtime.
export default handleRequest;

const httpServer = http.createServer(handleRequest);
const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  httpServer.listen(PORT, "127.0.0.1", () => {
    console.log(`DeMix Clerk MCP listening on http://127.0.0.1:${PORT}`);
    console.log("Clerk OAuth enabled. Admin allowlist enforced. Read-only tools only.");
  });
}
