import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCentralPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

const DATE = /^\\d{4}-\\d{2}-\\d{2}$/;
const TIME = /^(?:[01]\\d|2[0-3]):[0-5]\\d$/;

function validateDate(value: string, code: string) {
  if (!DATE.test(value) || Number.isNaN(Date.parse(value + "T00:00:00Z"))) throw new Error(code);
}
function validateTime(value: string, code: string) {
  if (!TIME.test(value)) throw new Error(code);
}
function validateOperationId(value: string) {
  if (value.trim().length < 10 || value.length > 200) throw new Error("INVALID_OPERATION_ID");
}
function minuteOfDay(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export const listShiftSetup = query({
  args: {},
  handler: async (ctx) => {
    await requireCentralPermission(ctx, "hr.structure.manage");
    const [shifts, employees, companies, stations, assignments] = await Promise.all([
      ctx.db.query("shifts").collect(),
      ctx.db.query("employees").collect(),
      ctx.db.query("companies").collect(),
      ctx.db.query("stations").collect(),
      ctx.db.query("employeeShiftAssignments").collect(),
    ]);
    return {
      shifts: shifts.sort((a, b) => a.name.localeCompare(b.name, "ar")).map((s) => ({
        ...s,
        companyName: companies.find((c) => c._id === s.companyId)?.name ?? "—",
        stationName: stations.find((x) => x._id === s.stationId)?.name ?? "كل المحطات",
      })),
      employees: employees.filter((e) => e.status === "active")
        .sort((a, b) => a.employeeNo.localeCompare(b.employeeNo, "en"))
        .map((e) => ({
          ...e,
          companyName: companies.find((c) => c._id === e.companyId)?.name ?? "—",
          stationName: stations.find((x) => x._id === e.stationId)?.name ?? "—",
        })),
      assignments: assignments.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    };
  },
});

export const createShift = mutation({
  args: {
    code: v.string(), name: v.string(), companyId: v.id("companies"),
    stationId: v.optional(v.id("stations")), startTime: v.string(), endTime: v.string(),
    breakMinutes: v.number(), graceMinutes: v.number(), weeklyDays: v.array(v.number()),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "hr.structure.manage");
    const code = args.code.trim().toUpperCase();
    const name = args.name.trim();
    if (!code || code.length > 30 || !name || name.length > 100) throw new Error("INVALID_SHIFT_NAME_OR_CODE");
    validateTime(args.startTime, "INVALID_SHIFT_START_TIME");
    validateTime(args.endTime, "INVALID_SHIFT_END_TIME");
    if (args.startTime === args.endTime) throw new Error("SHIFT_START_END_CANNOT_MATCH");
    if (!Number.isInteger(args.breakMinutes) || args.breakMinutes < 0 || args.breakMinutes > 360) throw new Error("INVALID_BREAK_MINUTES");
    if (!Number.isInteger(args.graceMinutes) || args.graceMinutes < 0 || args.graceMinutes > 180) throw new Error("INVALID_GRACE_MINUTES");
    if (!args.weeklyDays.length || args.weeklyDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
        new Set(args.weeklyDays).size !== args.weeklyDays.length) throw new Error("INVALID_WEEKLY_DAYS");
    const company = await ctx.db.get(args.companyId);
    if (!company || company.status !== "active") throw new Error("COMPANY_NOT_ACTIVE");
    if (args.stationId) {
      const station = await ctx.db.get(args.stationId);
      if (!station || station.status !== "active") throw new Error("STATION_NOT_ACTIVE");
    }
    validateOperationId(args.operationId);
    const duplicate = await ctx.db.query("shifts").withIndex("by_code", q => q.eq("code", code)).take(2);
    if (duplicate.length) throw new Error("DUPLICATE_SHIFT_CODE");
    const now = Date.now();
    const id = await ctx.db.insert("shifts", {
      code, name, companyId: args.companyId, stationId: args.stationId,
      startTime: args.startTime, endTime: args.endTime, breakMinutes: args.breakMinutes,
      graceMinutes: args.graceMinutes, weeklyDays: [...args.weeklyDays].sort((a,b) => a-b),
      status: "active", createdAt: now, updatedAt: now, createdBy: user._id,
    });
    await appendAuditLog(ctx, {
      stationId: args.stationId, action: "hr.shift.create", entityType: "shift",
      entityId: id, operationId: args.operationId,
      details: { code, name, startTime: args.startTime, endTime: args.endTime, weeklyDays: args.weeklyDays },
    });
    return { success: true, id };
  },
});

export const assignEmployeeShift = mutation({
  args: {
    employeeId: v.id("employees"), shiftId: v.id("shifts"),
    effectiveFrom: v.string(), effectiveTo: v.optional(v.string()), operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "hr.structure.manage");
    validateDate(args.effectiveFrom, "INVALID_EFFECTIVE_FROM");
    if (args.effectiveTo) {
      validateDate(args.effectiveTo, "INVALID_EFFECTIVE_TO");
      if (args.effectiveTo < args.effectiveFrom) throw new Error("EFFECTIVE_TO_BEFORE_FROM");
    }
    validateOperationId(args.operationId);
    const [employee, shift] = await Promise.all([ctx.db.get(args.employeeId), ctx.db.get(args.shiftId)]);
    if (!employee || employee.status !== "active") throw new Error("EMPLOYEE_NOT_ACTIVE");
    if (!shift || shift.status !== "active") throw new Error("SHIFT_NOT_ACTIVE");
    if (employee.companyId !== shift.companyId) throw new Error("EMPLOYEE_SHIFT_COMPANY_MISMATCH");
    if (shift.stationId && employee.stationId !== shift.stationId) throw new Error("EMPLOYEE_SHIFT_STATION_MISMATCH");
    const prior = await ctx.db.query("employeeShiftAssignments")
      .withIndex("by_employee", q => q.eq("employeeId", args.employeeId)).collect();
    const overlap = prior.some((a) => a.status === "active" &&
      (!args.effectiveTo || a.effectiveFrom <= args.effectiveTo) &&
      (!a.effectiveTo || a.effectiveTo >= args.effectiveFrom));
    if (overlap) throw new Error("SHIFT_ASSIGNMENT_DATE_OVERLAP");
    const now = Date.now();
    const id = await ctx.db.insert("employeeShiftAssignments", {
      employeeId: args.employeeId, shiftId: args.shiftId,
      effectiveFrom: args.effectiveFrom, effectiveTo: args.effectiveTo,
      status: "active", assignedBy: user._id, createdAt: now, updatedAt: now,
    });
    await appendAuditLog(ctx, {
      stationId: employee.stationId, action: "hr.shift.assign", entityType: "employee_shift_assignment",
      entityId: id, operationId: args.operationId,
      details: { employeeId: args.employeeId, shiftId: args.shiftId, effectiveFrom: args.effectiveFrom, effectiveTo: args.effectiveTo },
    });
    return { success: true, id };
  },
});

export const endEmployeeShiftAssignment = mutation({
  args: { assignmentId: v.id("employeeShiftAssignments"), effectiveTo: v.string(), operationId: v.string() },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "hr.structure.manage");
    validateDate(args.effectiveTo, "INVALID_EFFECTIVE_TO");
    validateOperationId(args.operationId);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.status !== "active") throw new Error("ACTIVE_ASSIGNMENT_NOT_FOUND");
    if (args.effectiveTo < assignment.effectiveFrom) throw new Error("EFFECTIVE_TO_BEFORE_FROM");
    const employee = await ctx.db.get(assignment.employeeId);
    await ctx.db.patch(args.assignmentId, { effectiveTo: args.effectiveTo, status: "ended", updatedAt: Date.now() });
    await appendAuditLog(ctx, {
      stationId: employee?.stationId, action: "hr.shift.assignment.end",
      entityType: "employee_shift_assignment", entityId: args.assignmentId,
      operationId: args.operationId, details: { effectiveTo: args.effectiveTo },
    });
    return { success: true };
  },
});
