import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

http.route({
  path: "/clerk-user-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expectedSecret = process.env.DEMIX_WEBHOOK_SECRET;
    const authorization = request.headers.get("authorization");
    if (!expectedSecret || authorization !== `Bearer ${expectedSecret}`) return new Response("Unauthorized", { status: 401 });
    const rawBody = await request.text();
    if (rawBody.length > 64_000) return new Response("Payload too large", { status: 413 });
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (typeof parsed !== "object" || parsed === null) return new Response("Invalid payload", { status: 400 });
      payload = parsed as Record<string, unknown>;
    } catch { return new Response("Invalid JSON", { status: 400 }); }
    if (typeof payload.eventId !== "string" || typeof payload.eventType !== "string" || typeof payload.clerkUserId !== "string" || typeof payload.invitationId !== "string" || typeof payload.email !== "string" || typeof payload.emailVerified !== "boolean") return new Response("Invalid webhook fields", { status: 400 });
    try {
      const result = await ctx.runMutation(internal.invitations.acceptInvitationFromClerk, {
        eventId: payload.eventId, eventType: payload.eventType, clerkUserId: payload.clerkUserId,
        invitationId: payload.invitationId as Id<"invitations">, email: payload.email, emailVerified: payload.emailVerified,
      });
      return Response.json(result);
    } catch (error) {
      console.error("Clerk webhook processing failed:", error);
      return Response.json({ success: false, error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
    }
  }),
});

http.route({
  path: "/station-sync",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expectedSecret = process.env.STATION_CONNECTOR_TOKEN;
    const authorization = request.headers.get("authorization");
    if (!expectedSecret || !authorization || !constantTimeEqual(authorization, `Bearer ${expectedSecret}`)) return new Response("Unauthorized", { status: 401 });
    const rawBody = await request.text();
    if (rawBody.length > 256_000) return new Response("Payload too large", { status: 413 });
    let payload: unknown;
    try { payload = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }
    if (!isObject(payload) || typeof payload.stationCode !== "string" || typeof payload.machineId !== "string" || typeof payload.batchId !== "string" || !Array.isArray(payload.records) || payload.records.length < 1 || payload.records.length > 100) return new Response("Invalid station batch", { status: 400 });
    try {
      const result = await ctx.runMutation(internal.stationSync.ingestBatch, {
        stationCode: payload.stationCode,
        machineId: payload.machineId,
        batchId: payload.batchId,
        records: payload.records as Array<{
          sourceRecordId: string; sourceHash: string; productionAt: number;
          customerName?: string; projectName?: string; jobNo?: string;
          concreteGrade?: string; quantity?: number; operatorName?: string; sourceUpdatedAt?: number;
        }>,
      });
      return Response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "SYNC_FAILED";
      try {
        await ctx.runMutation(internal.stationSync.recordFailure, {
          stationCode: payload.stationCode,
          message,
        });
      } catch (statusError) {
        console.error("Could not persist station sync failure:", statusError);
      }
      console.error("Station sync batch rejected:", error);
      return Response.json({ success: false, error: message }, { status: 400 });
    }
  }),
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export default http;
