import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireCentralPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

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
  truckNumber: v.optional(v.string()),
  driverName: v.optional(v.string()),
  operationState: v.optional(v.number()),
  rawSourceData: v.optional(v.any()),
  sourceUpdatedAt: v.optional(v.number()),
});

export const issueConnectorToken = mutation({
  args: { stationId: v.id("stations"), tokenHash: v.string(), operationId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "system.stations.manage");
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash)) throw new Error("INVALID_TOKEN_HASH");
    if (!args.operationId.trim() || args.operationId.length > 200) throw new Error("INVALID_OPERATION_ID");
    const station = await ctx.db.get(args.stationId);
    if (!station || station.status !== "active") throw new Error("STATION_NOT_FOUND_OR_INACTIVE");
    const owner = await ctx.db.query("stationConnectorCredentials")
      .withIndex("by_tokenHash", q => q.eq("tokenHash", args.tokenHash)).unique();
    if (owner && owner.stationId !== station._id) throw new Error("TOKEN_HASH_ALREADY_ASSIGNED");
    const existing = await ctx.db.query("stationConnectorCredentials")
      .withIndex("by_station", q => q.eq("stationId", station._id)).unique();
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { tokenHash: args.tokenHash, active: true, updatedAt: now });
    else await ctx.db.insert("stationConnectorCredentials", { stationId: station._id, tokenHash: args.tokenHash, active: true, createdAt: now, updatedAt: now });
    await appendAuditLog(ctx, {
      stationId: station._id, action: "station.connector_token.rotate",
      entityType: "station_connector_credential", entityId: String(station._id),
      operationId: args.operationId, details: { stationCode: station.code, changedBy: String(user._id) },
    });
    return { success: true, stationCode: station.code, stationName: station.name };
  },
});

export const authenticateConnectorToken = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const credential = await ctx.db.query("stationConnectorCredentials")
      .withIndex("by_tokenHash", q => q.eq("tokenHash", args.tokenHash)).unique();
    if (!credential || !credential.active) return null;
    const station = await ctx.db.get(credential.stationId);
    if (!station || station.status !== "active") return null;
    return { stationId: station._id, stationCode: station.code };
  },
});

export const ingestBatch = internalMutation({
  args: {
    stationCode: v.string(),
    machineId: v.string(),
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
      if (previous.stationId !== station._id || (previous.machineId && previous.machineId !== args.machineId)) throw new Error("BATCH_ID_CONFLICT");
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
      for (const value of [record.customerName, record.projectName, record.jobNo, record.concreteGrade, record.operatorName, record.truckNumber, record.driverName]) {
        if (value !== undefined && value.length > 300) throw new Error("SOURCE_FIELD_TOO_LONG");
      }
      if (record.operationState !== undefined && !Number.isFinite(record.operationState)) throw new Error("INVALID_OPERATION_STATE");
      if (record.rawSourceData !== undefined && (typeof record.rawSourceData !== "object" || record.rawSourceData === null || Array.isArray(record.rawSourceData))) throw new Error("INVALID_RAW_SOURCE_DATA");
      const existing = await ctx.db.query("stationProductionImports")
        .withIndex("by_station_machine_source", q => q.eq("stationId", station._id).eq("machineId", args.machineId).eq("sourceRecordId", record.sourceRecordId))
        .unique();
      // Adopt pre-machine-key imports for backward compatibility, but never merge two known machines.
      const legacy = existing ? null : await ctx.db.query("stationProductionImports")
        .withIndex("by_station_source", q => q.eq("stationId", station._id).eq("sourceRecordId", record.sourceRecordId))
        .unique();
      const adoptLegacy = legacy && legacy.machineId === undefined ? legacy : null;
      const current = existing ?? adoptLegacy;
      if (current) {
        if (current.sourceHash !== record.sourceHash || current.machineId !== args.machineId) {
          await ctx.db.patch(current._id, {
            machineId: args.machineId,
            sourceHash: record.sourceHash,
            productionAt: record.productionAt,
            customerName: record.customerName,
            projectName: record.projectName,
            jobNo: record.jobNo,
            concreteGrade: record.concreteGrade,
            quantity: record.quantity,
            operatorName: record.operatorName,
            truckNumber: record.truckNumber,
            driverName: record.driverName,
            operationState: record.operationState,
            rawSourceData: record.rawSourceData,
            sourceUpdatedAt: record.sourceUpdatedAt,
            importedAt: now,
          });
          updated += 1;
        }
      } else {
        await ctx.db.insert("stationProductionImports", {
          stationId: station._id,
          machineId: args.machineId,
          ...record,
          importedAt: now,
        });
        inserted += 1;
      }
    }
    await ctx.db.insert("stationSyncBatches", {
      batchId: args.batchId,
      stationId: station._id,
      machineId: args.machineId,
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

export const listProductionImports = query({
  args: {
    stationId: v.id("stations"),
    fromAt: v.number(),
    toAt: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "system.stations.manage");
    if (args.fromAt > args.toAt) throw new Error("INVALID_PRODUCTION_DATE_RANGE");
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 500), 1), 1000);
    const rows = await ctx.db.query("stationProductionImports")
      .withIndex("by_station_time", q =>
        q.eq("stationId", args.stationId)
          .gte("productionAt", args.fromAt)
          .lte("productionAt", args.toAt)
      )
      .order("desc")
      .take(limit + 1);
    return {
      items: rows.slice(0, limit),
      hasMore: rows.length > limit,
      limit,
    };
  },
});


export const listImportedRecordsForConnector = internalQuery({
  args: {
    stationId: v.id("stations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("stationProductionImports")
      .withIndex("by_station_time", q => q.eq("stationId", args.stationId))
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(record => ({
        sourceRecordId: record.sourceRecordId,
        sourceHash: record.sourceHash,
        productionAt: record.productionAt,
        customerName: record.customerName,
        projectName: record.projectName,
        jobNo: record.jobNo,
        quantity: record.quantity,
        machineId: record.machineId,
      })),
    };
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
