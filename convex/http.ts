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
  path: "/station-sync/check",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
    const token = authorization.slice(7).trim();
    if (!token || token.length > 512) return new Response("Unauthorized", { status: 401 });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const credential = await ctx.runQuery(internal.stationSync.authenticateConnectorToken, { tokenHash });
    if (!credential) return new Response("Unauthorized", { status: 401 });
    const rawBody = await request.text();
    if (rawBody.length > 64_000) return new Response("Payload too large", { status: 413 });
    let payload: unknown;
    try { payload = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }
    if (!isObject(payload) || typeof payload.machineId !== "string" || !Array.isArray(payload.records) || payload.records.length < 1 || payload.records.length > 100) return new Response("Invalid check request", { status: 400 });
    const records = payload.records as Array<{sourceRecordId:string;sourceHash:string}>;
    if (records.some(x => !x || typeof x.sourceRecordId !== "string" || typeof x.sourceHash !== "string" || x.sourceRecordId.length > 160 || x.sourceHash.length > 128)) return new Response("Invalid check records", { status: 400 });
    try {
      const result = await ctx.runQuery(internal.stationSync.checkSourceRecords, {
        stationCode: credential.stationCode, machineId: payload.machineId, records,
      });
      return Response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "CHECK_FAILED";
      return Response.json({ success: false, error: message }, { status: 400 });
    }
  }),
});

http.route({
  path: "/station-sync/manifest",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
    const token = authorization.slice(7).trim();
    if (!token || token.length > 512) return new Response("Unauthorized", { status: 401 });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const credential = await ctx.runQuery(internal.stationSync.authenticateConnectorToken, { tokenHash });
    if (!credential) return new Response("Unauthorized", { status: 401 });
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const rawSize = Number(url.searchParams.get("numItems") ?? "500");
    const numItems = Number.isInteger(rawSize) ? Math.max(1, Math.min(500, rawSize)) : 500;
    try {
      const result = await ctx.runQuery(internal.stationSync.listStationManifest, {
        stationCode: credential.stationCode, cursor, numItems,
      });
      return Response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "MANIFEST_FAILED";
      return Response.json({ success: false, error: message }, { status: 400 });
    }
  }),
});

http.route({
  path: "/station-sync/reconciliation",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
    const token = authorization.slice(7).trim();
    if (!token || token.length > 512) return new Response("Unauthorized", { status: 401 });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const credential = await ctx.runQuery(internal.stationSync.authenticateConnectorToken, { tokenHash });
    if (!credential) return new Response("Unauthorized", { status: 401 });
    const rawBody = await request.text();
    if (rawBody.length > 128_000) return new Response("Payload too large", { status: 413 });
    let payload: unknown;
    try { payload = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }
    if (!isObject(payload) || typeof payload.machineId !== "string" ||
      !["sourceRecords","serverRecords","matched","fileOnly","demixOnly","different","duplicates"].every(k => typeof payload[k] === "number" && Number.isInteger(payload[k]) && Number(payload[k]) >= 0) ||
      !Array.isArray(payload.details) || payload.details.length > 500) return new Response("Invalid reconciliation report", { status: 400 });
    try {
      const result = await ctx.runMutation(internal.stationSync.saveReconciliationReport, {
        stationCode: credential.stationCode, machineId: payload.machineId,
        sourceRecords: payload.sourceRecords as number, serverRecords: payload.serverRecords as number,
        matched: payload.matched as number, fileOnly: payload.fileOnly as number,
        demixOnly: payload.demixOnly as number, different: payload.different as number,
        duplicates: payload.duplicates as number,
        details: payload.details as Array<{status:string;sourceRecordId:string;sourceHash?:string;serverHash?:string}>,
      });
      return Response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "RECONCILIATION_SAVE_FAILED";
      return Response.json({ success: false, error: message }, { status: 400 });
    }
  }),
});

http.route({
  path: "/station-sync",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
    const token = authorization.slice(7).trim();
    if (!token || token.length > 512) return new Response("Unauthorized", { status: 401 });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const credential = await ctx.runQuery(internal.stationSync.authenticateConnectorToken, { tokenHash });
    if (!credential) return new Response("Unauthorized", { status: 401 });

    const rawBody = await request.text();
    if (rawBody.length > 256_000) return new Response("Payload too large", { status: 413 });
    let payload: unknown;
    try { payload = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }
    if (!isObject(payload) || typeof payload.stationCode !== "string" || typeof payload.machineId !== "string" || typeof payload.batchId !== "string" || !Array.isArray(payload.records) || payload.records.length < 1 || payload.records.length > 100) return new Response("Invalid station batch", { status: 400 });
    if (payload.stationCode !== credential.stationCode) return new Response("Station credential mismatch", { status: 403 });
    try {
      const result = await ctx.runMutation(internal.stationSync.ingestBatch, {
        stationCode: credential.stationCode, machineId: payload.machineId, batchId: payload.batchId,
        records: payload.records as Array<{
          sourceRecordId: string; sourceHash: string; productionAt: number;
          customerName?: string; projectName?: string; jobNo?: string;
          concreteGrade?: string; quantity?: number; operatorName?: string; truckNo?: string;
          operationState?: string; rawSourceData?: Record<string, unknown>; sourceUpdatedAt?: number;
        }>,
      });
      return Response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "SYNC_FAILED";
      try { await ctx.runMutation(internal.stationSync.recordFailure, { stationCode: credential.stationCode, message }); }
      catch (statusError) { console.error("Could not persist station sync failure:", statusError); }
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
