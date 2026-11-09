import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActiveUser, requireStationPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

const READ = "production.records.read";
const CREATE = "production.records.create";
const UPDATE = "production.records.update";

function validateRecord(input: {
  productionAt: number;
  customerName: string;
  projectName: string;
  jobNo: string;
  concreteGrade: string;
  quantity: number;
  operatorName: string;
  notes?: string;
}) {
  if (!Number.isFinite(input.productionAt) || input.productionAt <= 0) {
    throw new Error("INVALID_PRODUCTION_DATE");
  }
  for (const [value, code] of [
    [input.customerName, "INVALID_CUSTOMER_NAME"],
    [input.projectName, "INVALID_PROJECT_NAME"],
    [input.jobNo, "INVALID_JOB_NUMBER"],
    [input.concreteGrade, "INVALID_CONCRETE_GRADE"],
    [input.operatorName, "INVALID_OPERATOR_NAME"],
  ] as const) {
    if (!value.trim() || value.trim().length > 160) throw new Error(code);
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > 100000) {
    throw new Error("INVALID_PRODUCTION_QUANTITY");
  }
  if ((input.notes ?? "").length > 2000) throw new Error("NOTES_TOO_LONG");
}

const recordFields = {
  productionAt: v.number(),
  customerName: v.string(),
  projectName: v.string(),
  jobNo: v.string(),
  concreteGrade: v.string(),
  quantity: v.number(),
  operatorName: v.string(),
  notes: v.optional(v.string()),
};

export const listMyStations = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireActiveUser(ctx);
    const assignments = await ctx.db.query("userStations")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const result = [];
    for (const assignment of assignments) {
      if (assignment.status !== "active") continue;
      const station = await ctx.db.get(assignment.stationId);
      if (!station || station.status !== "active") continue;
      try {
        await requireStationPermission(ctx, station._id, READ);
        result.push({ id: station._id, code: station.code, name: station.name });
      } catch {
        // A station is listed only when the current user has explicit read access.
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  },
});

export const listRecords = query({
  args: { stationId: v.id("stations") },
  handler: async (ctx, args) => {
    await requireStationPermission(ctx, args.stationId, READ);
    return await ctx.db.query("productionRecords")
      .withIndex("by_station_time", (q) => q.eq("stationId", args.stationId))
      .order("desc")
      .take(200);
  },
});

export const createRecord = mutation({
  args: {
    stationId: v.id("stations"),
    ...recordFields,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireStationPermission(ctx, args.stationId, CREATE);
    validateRecord(args);
    const operationId = args.operationId.trim();
    if (operationId.length < 10 || operationId.length > 200) throw new Error("INVALID_OPERATION_ID");

    const now = Date.now();
    const recordId = await ctx.db.insert("productionRecords", {
      stationId: args.stationId,
      productionAt: args.productionAt,
      customerName: args.customerName.trim(),
      projectName: args.projectName.trim(),
      jobNo: args.jobNo.trim(),
      concreteGrade: args.concreteGrade.trim(),
      quantity: args.quantity,
      operatorName: args.operatorName.trim(),
      notes: args.notes?.trim() || undefined,
      createdBy: user._id,
      updatedBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await appendAuditLog(ctx, {
      stationId: args.stationId,
      action: "production.record.create",
      entityType: "productionRecord",
      entityId: recordId,
      operationId,
      details: {
        recordId,
        jobNo: args.jobNo.trim(),
        quantity: args.quantity,
      },
    });
    return { success: true, recordId };
  },
});

export const updateRecord = mutation({
  args: {
    recordId: v.id("productionRecords"),
    ...recordFields,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.recordId);
    if (!existing) throw new Error("PRODUCTION_RECORD_NOT_FOUND");
    const { user } = await requireStationPermission(ctx, existing.stationId, UPDATE);
    validateRecord(args);
    const operationId = args.operationId.trim();
    if (operationId.length < 10 || operationId.length > 200) throw new Error("INVALID_OPERATION_ID");

    const now = Date.now();
    await ctx.db.patch(args.recordId, {
      productionAt: args.productionAt,
      customerName: args.customerName.trim(),
      projectName: args.projectName.trim(),
      jobNo: args.jobNo.trim(),
      concreteGrade: args.concreteGrade.trim(),
      quantity: args.quantity,
      operatorName: args.operatorName.trim(),
      notes: args.notes?.trim() || undefined,
      updatedBy: user._id,
      updatedAt: now,
    });
    await appendAuditLog(ctx, {
      stationId: existing.stationId,
      action: "production.record.update",
      entityType: "productionRecord",
      entityId: args.recordId,
      operationId,
      details: {
        recordId: args.recordId,
        jobNo: args.jobNo.trim(),
        quantity: args.quantity,
      },
    });
    return { success: true, recordId: args.recordId };
  },
});
