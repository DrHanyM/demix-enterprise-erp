import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireCentralPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

const CUTOFF_UTC_MS = Date.UTC(2026, 0, 1);
const BATCH_SIZE = 100;

function detectTimestampUnit(value: number): "seconds" | "milliseconds" {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("UNSUPPORTED_PRODUCTION_TIMESTAMP");
  }
  if (value >= 1_000_000_000 && value < 100_000_000_000) return "seconds";
  if (value >= 100_000_000_000 && value < 100_000_000_000_000) return "milliseconds";
  throw new Error("UNSUPPORTED_PRODUCTION_TIMESTAMP_UNIT");
}

export const startPre2026Cleanup = mutation({
  args: { operationId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "system.stations.manage");

    if (!args.operationId.trim() || args.operationId.length > 200) {
      throw new Error("INVALID_OPERATION_ID");
    }

    // Read only the oldest indexed productionAt value to detect its numeric unit.
    // No production payload or raw source fields are returned or logged.
    const oldest = await ctx.db
      .query("stationProductionImports")
      .withIndex("by_productionAt")
      .order("asc")
      .first();

    if (!oldest) {
      return { success: true, scheduled: false, complete: true, deletedSoFar: 0 };
    }

    const timestampUnit = detectTimestampUnit(oldest.productionAt);
    const cutoff = timestampUnit === "seconds"
      ? Math.floor(CUTOFF_UTC_MS / 1000)
      : CUTOFF_UTC_MS;

    if (oldest.productionAt >= cutoff) {
      return { success: true, scheduled: false, complete: true, deletedSoFar: 0 };
    }

    await appendAuditLog(ctx, {
      action: "station.production_imports.cleanup_started",
      entityType: "stationProductionImports",
      operationId: args.operationId,
      details: {
        cutoffUtc: "2026-01-01T00:00:00.000Z",
        timestampUnit,
        batchSize: BATCH_SIZE,
        requestedBy: String(user._id),
        scope: "productionAt strictly before 2026-01-01 UTC",
      },
    });

    await ctx.scheduler.runAfter(
      0,
      internal.stationDataCleanup.deletePre2026Batch,
      { deletedSoFar: 0, cutoff, timestampUnit }
    );

    return {
      success: true,
      scheduled: true,
      cutoffUtc: "2026-01-01T00:00:00.000Z",
      timestampUnit,
      batchSize: BATCH_SIZE,
    };
  },
});

export const deletePre2026Batch = internalMutation({
  args: {
    deletedSoFar: v.number(),
    cutoff: v.number(),
    timestampUnit: v.union(v.literal("seconds"), v.literal("milliseconds")),
  },
  handler: async (ctx, args) => {
    const oldRows = await ctx.db
      .query("stationProductionImports")
      .withIndex("by_productionAt", (q) => q.lt("productionAt", args.cutoff))
      .take(BATCH_SIZE);

    for (const row of oldRows) {
      // Fail closed if timestamps unexpectedly mix seconds and milliseconds.
      const rowUnit = detectTimestampUnit(row.productionAt);
      if (rowUnit !== args.timestampUnit) {
        throw new Error("MIXED_PRODUCTION_TIMESTAMP_UNITS_ABORTED");
      }
      if (row.productionAt < args.cutoff) {
        await ctx.db.delete(row._id);
      }
    }

    const deletedSoFar = args.deletedSoFar + oldRows.length;
    if (oldRows.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.stationDataCleanup.deletePre2026Batch,
        { deletedSoFar, cutoff: args.cutoff, timestampUnit: args.timestampUnit }
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
