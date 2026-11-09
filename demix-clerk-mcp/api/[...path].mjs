import { handleRequest } from "../server.mjs";

// Vercel Node.js Function adapter. The shared handler normalizes /api/* rewrites
// back to the public MCP and OAuth metadata paths before routing the request.
export default async function handler(req, res) {
  await handleRequest(req, res);
}
