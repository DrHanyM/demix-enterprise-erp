import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireCentralPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

// productionAt is stored as a Unix timestamp in milliseconds.
const CUTOFF_UTC_MS = Date.UTC(2026, 0, 1);
const BATCH_SIZE = 100;

export const startPre2026Cleanup = mutation({
  args: { operationId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(
      ctx,
      "system.stations.manage"
    );

    if (!args.operationId.trim() || args.operationId.length > 200) {
      throw new Error("INVALID_OPERATION_ID");
    }

    await appendAuditLog(ctx, {
      action: "station.production_imports.cleanup_started",
      entityType: "stationProductionImports",
      operationId: args.operationId,
      details: {
        cutoffExclusive: CUTOFF_UTC_MS,
        cutoffUtc: "2026-01-01T00:00:00.000Z",
        batchSize: BATCH_SIZE,
        requestedBy: String(user._id),
        scope: "productionAt < 2026-01-01T00:00:00.000Z",
      },
    });

    await ctx.scheduler.runAfter(
      0,
      internal.stationDataCleanup.deletePre2026Batch,
      { deletedSoFar: 0 }
    );

    return {
      success: true,
      scheduled: true,
      cutoffUtc: "2026-01-01T00:00:00.000Z",
      batchSize: BATCH_SIZE,
    };
  },
});

export const deletePre2026Batch = internalMutation({
  args: { deletedSoFar: v.number() },
  handler: async (ctx, args) => {
    const oldRows = await ctx.db
      .query("stationProductionImports")
      .withIndex("by_productionAt", (q) =>
        q.lt("productionAt", CUTOFF_UTC_MS)
      )
      .take(BATCH_SIZE);

    for (const row of oldRows) {
      // Re-check the strict cutoff immediately before deletion.
      if (row.productionAt < CUTOFF_UTC_MS) {
        await ctx.db.delete(row._id);
      }
    }

    const deletedSoFar = args.deletedSoFar + oldRows.length;

    if (oldRows.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.stationDataCleanup.deletePre2026Batch,
        { deletedSoFar }
      );
    }

    return {
      success: true,
      deletedThisBatch: oldRows.length,
      deletedSoFar,
      complete: oldRows.length < BATCH_SIZE,
    };
  },
});
