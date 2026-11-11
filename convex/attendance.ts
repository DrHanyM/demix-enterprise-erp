import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCentralPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

const methodValidator = v.union(
  v.literal("fingerprint"),
  v.literal("geofence"),
  v.literal("link")
);

export const listAttendanceSetup = query({
  args: {},
  handler: async (ctx) => {
    await requireCentralPermission(ctx, "system.permissions.manage");
    const employees = await ctx.db.query("employees").collect();
    const policies = await ctx.db.query("attendancePolicies").collect();
    const companies = await ctx.db.query("companies").collect();
    const stations = await ctx.db.query("stations").collect();
    const departments = await ctx.db.query("departments").collect();
    const policyByEmployee = new Map(policies.map((p) => [p.employeeId, p]));
    return employees
      .filter((e) => e.status === "active")
      .map((employee) => ({
        employee,
        policy: policyByEmployee.get(employee._id) ?? null,
        companyName: companies.find((c) => c._id === employee.companyId)?.name ?? "—",
        stationName: stations.find((s) => s._id === employee.stationId)?.name ?? "مركزي",
        departmentName: departments.find((d) => d._id === employee.departmentId)?.name ?? "—",
        effectiveMethod: policyByEmployee.get(employee._id)?.enabled
          ? policyByEmployee.get(employee._id)!.method
          : "fingerprint" as const,
      }))
      .sort((a, b) => a.employee.employeeNo.localeCompare(b.employee.employeeNo, "en"));
  },
});

export const setEmployeeAttendanceMethod = mutation({
  args: {
    employeeId: v.id("employees"),
    method: methodValidator,
    enabled: v.boolean(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    radiusMeters: v.optional(v.number()),
    notes: v.optional(v.string()),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "system.permissions.manage");
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.status !== "active") throw new Error("EMPLOYEE_NOT_ACTIVE");
    if (args.operationId.trim().length < 10 || args.operationId.length > 200) throw new Error("INVALID_OPERATION_ID");
    if (args.method === "geofence" && args.enabled) {
      if (args.latitude === undefined || args.longitude === undefined ||
          args.latitude < -90 || args.latitude > 90 ||
          args.longitude < -180 || args.longitude > 180) {
        throw new Error("GEOFENCE_COORDINATES_REQUIRED");
      }
      if (args.radiusMeters === undefined || args.radiusMeters < 30 || args.radiusMeters > 2000) {
        throw new Error("GEOFENCE_RADIUS_OUT_OF_RANGE");
      }
    }
    if (args.method !== "geofence" && (args.latitude !== undefined || args.longitude !== undefined || args.radiusMeters !== undefined)) {
      throw new Error("GEOFENCE_SETTINGS_ONLY_FOR_GEOFENCE");
    }
    const existing = await ctx.db.query("attendancePolicies")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .take(2);
    if (existing.length > 1) throw new Error("DUPLICATE_ATTENDANCE_POLICY");
    const now = Date.now();
    const values = {
      employeeId: args.employeeId,
      method: args.method,
      enabled: args.enabled,
      latitude: args.method === "geofence" ? args.latitude : undefined,
      longitude: args.method === "geofence" ? args.longitude : undefined,
      radiusMeters: args.method === "geofence" ? args.radiusMeters : undefined,
      notes: args.notes?.trim().slice(0, 500) || undefined,
      assignedBy: user._id,
      assignedAt: existing[0]?.assignedAt ?? now,
      updatedAt: now,
    };
    const policyId = existing[0]
      ? (await ctx.db.patch(existing[0]._id, values), existing[0]._id)
      : await ctx.db.insert("attendancePolicies", values);
    await appendAuditLog(ctx, {
      action: "hr.attendance.policy.update",
      entityType: "attendance_policy",
      entityId: String(policyId),
      operationId: args.operationId,
      stationId: employee.stationId,
      details: {
        employeeId: String(employee._id),
        employeeNo: employee.employeeNo,
        method: args.method,
        enabled: args.enabled,
        latitude: args.latitude,
        longitude: args.longitude,
        radiusMeters: args.radiusMeters,
      },
    });
    return { success: true, policyId };
  },
});
