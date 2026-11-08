import http from "node:http";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.PORT || 8787);
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const MCP_ACCESS_TOKEN = process.env.MCP_ACCESS_TOKEN;
const CLERK_API_BASE = "https://api.clerk.com/v1";

if (!CLERK_SECRET_KEY || !CLERK_SECRET_KEY.startsWith("sk_")) {
  console.error("Missing/invalid CLERK_SECRET_KEY. Set it in your local environment.");
  process.exit(1);
}
if (!MCP_ACCESS_TOKEN || MCP_ACCESS_TOKEN.length < 32) {
  console.error("Set MCP_ACCESS_TOKEN to a random value of at least 32 characters.");
  process.exit(1);
}

function safeEqual(a, b) {
  const aa = Buffer.from(a || "");
  const bb = Buffer.from(b || "");
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
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

  if (url.pathname !== "/mcp") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const auth = req.headers.authorization || "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!safeEqual(supplied, MCP_ACCESS_TOKEN)) {
    res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  if (!["POST", "GET", "DELETE"].includes(req.method || "")) {
    res.writeHead(405, { Allow: "POST, GET, DELETE" });
    res.end("Method not allowed");
    return;
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
  console.log("Read-only tools enabled. No write/delete tools are exposed.");
});
