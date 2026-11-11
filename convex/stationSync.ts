import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireCentralPermission } from "./lib/auth";
import { internal } from "./_generated/api";

const importedRecord = v.object({
  sourceRecordId: v.string(),
  sourceHash: v.string(),
  productionAt: v.number(),
  customerName: v.optional(v.string()),
  projectName: v.optional(v.string()),
  jobNo: v.optional(v.string()),
  concreteGrade: v.optional(v.string()),
  quantity: v.optional(v.number()),
  operatorName: v.optional(v.string()),
  sourceUpdatedAt: v.optional(v.number()),
});

export const ingestBatch = internalMutation({
  args: {
    stationCode: v.string(),
    batchId: v.string(),
    records: v.array(importedRecord),
  },
  handler: async (ctx, args) => {
    if (!args.batchId.trim() || args.batchId.length > 160) throw new Error("INVALID_BATCH_ID");
    if (args.records.length < 1 || args.records.length > 100) throw new Error("INVALID_BATCH_SIZE");
    const station = await ctx.db.query("stations")
      .withIndex("by_code", q => q.eq("code", args.stationCode))
      .unique();
    if (!station || station.status !== "active") throw new Error("STATION_NOT_FOUND_OR_INACTIVE");

    const previous = await ctx.db.query("stationSyncBatches")
      .withIndex("by_batchId", q => q.eq("batchId", args.batchId))
      .unique();
    if (previous) {
      if (previous.stationId !== station._id) throw new Error("BATCH_ID_CONFLICT");
      return { success: true, duplicateBatch: true, received: previous.received, inserted: previous.inserted, updated: previous.updated };
    }

    let inserted = 0;
    let updated = 0;
    const now = Date.now();
    for (const record of args.records) {
      if (!record.sourceRecordId.trim() || record.sourceRecordId.length > 160) throw new Error("INVALID_SOURCE_RECORD_ID");
      if (!record.sourceHash.trim() || record.sourceHash.length > 128) throw new Error("INVALID_SOURCE_HASH");
      if (!Number.isFinite(record.productionAt) || record.productionAt <= 0) throw new Error("INVALID_PRODUCTION_TIMESTAMP");
      if (record.quantity !== undefined && (!Number.isFinite(record.quantity) || record.quantity < 0 || record.quantity > 100000)) throw new Error("INVALID_PRODUCTION_QUANTITY");
      for (const value of [record.customerName, record.projectName, record.jobNo, record.concreteGrade, record.operatorName]) {
        if (value !== undefined && value.length > 300) throw new Error("SOURCE_FIELD_TOO_LONG");
      }
      const existing = await ctx.db.query("stationProductionImports")
        .withIndex("by_station_source", q => q.eq("stationId", station._id).eq("sourceRecordId", record.sourceRecordId))
        .unique();
      if (existing) {
        if (existing.sourceHash !== record.sourceHash) {
          await ctx.db.patch(existing._id, {
            sourceHash: record.sourceHash,
            productionAt: record.productionAt,
            customerName: record.customerName,
            projectName: record.projectName,
            jobNo: record.jobNo,
            concreteGrade: record.concreteGrade,
            quantity: record.quantity,
            operatorName: record.operatorName,
            sourceUpdatedAt: record.sourceUpdatedAt,
            importedAt: now,
          });
          updated += 1;
        }
      } else {
        await ctx.db.insert("stationProductionImports", {
          stationId: station._id,
          ...record,
          importedAt: now,
        });
        inserted += 1;
      }
    }
    await ctx.db.insert("stationSyncBatches", {
      batchId: args.batchId,
      stationId: station._id,
      received: args.records.length,
      inserted,
      updated,
      processedAt: now,
    });
    const state = await ctx.db.query("stationSyncState")
      .withIndex("by_station", q => q.eq("stationId", station._id))
      .unique();
    const values = {
      status: "online" as const,
      lastSeenAt: now,
      lastSuccessAt: now,
      lastBatchId: args.batchId,
      recordsReceived: (state?.recordsReceived ?? 0) + args.records.length,
      recordsInserted: (state?.recordsInserted ?? 0) + inserted,
      recordsUpdated: (state?.recordsUpdated ?? 0) + updated,
      lastError: undefined,
    };
    if (state) await ctx.db.patch(state._id, values);
    else await ctx.db.insert("stationSyncState", { stationId: station._id, ...values });
    return { success: true, duplicateBatch: false, received: args.records.length, inserted, updated };
  },
});

export const recordFailure = internalMutation({
  args: { stationCode: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const station = await ctx.db.query("stations")
      .withIndex("by_code", q => q.eq("code", args.stationCode))
      .unique();
    if (!station) throw new Error("STATION_NOT_FOUND");
    const now = Date.now();
    const state = await ctx.db.query("stationSyncState")
      .withIndex("by_station", q => q.eq("stationId", station._id))
      .unique();
    const values = { status: "error" as const, lastSeenAt: now, lastError: args.message.slice(0, 500) };
    if (state) await ctx.db.patch(state._id, values);
    else await ctx.db.insert("stationSyncState", { stationId: station._id, ...values, recordsReceived: 0, recordsInserted: 0, recordsUpdated: 0 });
  },
});

export const listSyncStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireCentralPermission(ctx, "system.stations.manage");
    const stations = await ctx.db.query("stations").collect();
    const result = [];
    for (const station of stations) {
      const state = await ctx.db.query("stationSyncState")
        .withIndex("by_station", q => q.eq("stationId", station._id))
        .unique();
      result.push({
        stationId: station._id,
        code: station.code,
        name: station.name,
        stationStatus: station.status,
        syncStatus: state?.status ?? "never_connected",
        lastSeenAt: state?.lastSeenAt,
        lastSuccessAt: state?.lastSuccessAt,
        lastBatchId: state?.lastBatchId,
        recordsReceived: state?.recordsReceived ?? 0,
        recordsInserted: state?.recordsInserted ?? 0,
        recordsUpdated: state?.recordsUpdated ?? 0,
        lastError: state?.lastError,
      });
    }
    return result.sort((a, b) => a.code.localeCompare(b.code));
  },
});
