import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCentralPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

const ACTIVE = v.union(v.literal("active"), v.literal("inactive"));
const EMPLOYEE_STATUSES = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("on_leave"),
  v.literal("terminated")
);

function clean(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

function requireText(value: string, label: string, max = 120): string {
  const result = value.trim();
  if (!result || result.length > max) throw new Error(`INVALID_${label.toUpperCase()}`);
  return result;
}

function requireOperationId(value: string): string {
  const result = value.trim();
  if (result.length < 10 || result.length > 200) throw new Error("INVALID_OPERATION_ID");
  return result;
}

async function ensureUniqueCode(
  ctx: any,
  table: "companies" | "departments" | "jobTitles",
  code: string,
  excludeId?: string
) {
  const rows = await ctx.db.query(table).withIndex("by_code", (q: any) => q.eq("code", code)).take(2);
  if (rows.some((row: any) => row._id !== excludeId)) throw new Error("DUPLICATE_CODE");
}

async function validateDepartmentParent(
  ctx: any,
  companyId: Id<"companies">,
  parentDepartmentId?: Id<"departments">,
  currentDepartmentId?: Id<"departments">,
  stationId?: Id<"stations">
) {
  let cursorId = parentDepartmentId;
  const visited = new Set<string>();

  while (cursorId) {
    if (cursorId === currentDepartmentId) {
      throw new Error("DEPARTMENT_PARENT_CYCLE");
    }
    if (visited.has(cursorId)) {
      throw new Error("EXISTING_DEPARTMENT_PARENT_CYCLE");
    }
    visited.add(cursorId);

    const parent = await ctx.db.get(cursorId);
    if (!parent || parent.companyId !== companyId || parent.status !== "active") {
      throw new Error("INVALID_PARENT_DEPARTMENT");
    }
    if (stationId && parent.stationId && parent.stationId !== stationId) {
      throw new Error("PARENT_DEPARTMENT_STATION_MISMATCH");
    }
    cursorId = parent.parentDepartmentId;
  }
}

async function record(
  ctx: any,
  stationId: Id<"stations"> | undefined,
  action: string,
  entityType: string,
  entityId: string,
  operationId: string,
  details: Record<string, unknown>
) {
  await appendAuditLog(ctx, { stationId, action, entityType, entityId, operationId, details });
}

// Companies
export const createCompany = mutation({
  args: {
    code: v.string(), name: v.string(), legalName: v.optional(v.string()),
    taxNumber: v.optional(v.string()), address: v.optional(v.string()),
    phone: v.optional(v.string()), email: v.optional(v.string()), operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "hr.structure.manage");
    const code = requireText(args.code, "company_code", 30).toUpperCase();
    const name = requireText(args.name, "company_name");
    const operationId = requireOperationId(args.operationId);
    await ensureUniqueCode(ctx, "companies", code);
    const now = Date.now();
    const id = await ctx.db.insert("companies", {
      code, name, legalName: clean(args.legalName), taxNumber: clean(args.taxNumber),
      address: clean(args.address), phone: clean(args.phone), email: clean(args.email)?.toLowerCase(),
      status: "active", createdAt: now, updatedAt: now, createdBy: user._id,
    });
    await record(ctx, undefined, "hr.company.create", "company", id, operationId, { code, name });
    return { success: true, id };
  },
});

export const listCompanies = query({
  args: {},
  handler: async (ctx) => {
    await requireCentralPermission(ctx, "hr.structure.manage");
    return (await ctx.db.query("companies").collect()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  },
});

// Departments
export const createDepartment = mutation({
  args: {
    code: v.string(), name: v.string(), companyId: v.id("companies"),
    stationId: v.optional(v.id("stations")), parentDepartmentId: v.optional(v.id("departments")),
    description: v.optional(v.string()), operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "hr.structure.manage");
    const code = requireText(args.code, "department_code", 30).toUpperCase();
    const name = requireText(args.name, "department_name");
    const company = await ctx.db.get(args.companyId);
    if (!company || company.status !== "active") throw new Error("COMPANY_NOT_ACTIVE");
    if (args.stationId) {
      const station = await ctx.db.get(args.stationId);
      if (!station || station.status !== "active") throw new Error("STATION_NOT_ACTIVE");
    }
    await validateDepartmentParent(ctx, args.companyId, args.parentDepartmentId, undefined, args.stationId);
    await ensureUniqueCode(ctx, "departments", code);
    const operationId = requireOperationId(args.operationId);
    const now = Date.now();
    const id = await ctx.db.insert("departments", {
      code, name, companyId: args.companyId, stationId: args.stationId,
      parentDepartmentId: args.parentDepartmentId, description: clean(args.description),
      status: "active", createdAt: now, updatedAt: now, createdBy: user._id,
    });
    await record(ctx, args.stationId, "hr.department.create", "department", id, operationId,
      { code, name, companyId: args.companyId, parentDepartmentId: args.parentDepartmentId });
    return { success: true, id };
  },
});

export const listDepartments = query({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "hr.structure.manage");
    const rows = args.companyId
      ? await ctx.db.query("departments").withIndex("by_company", q => q.eq("companyId", args.companyId!)).collect()
      : await ctx.db.query("departments").collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  },
});

// Job titles
export const createJobTitle = mutation({
  args: {
    code: v.string(), name: v.string(), description: v.optional(v.string()),
    departmentId: v.optional(v.id("departments")), grade: v.optional(v.string()), operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "hr.structure.manage");
    const code = requireText(args.code, "job_title_code", 30).toUpperCase();
    const name = requireText(args.name, "job_title_name");
    if (args.departmentId) {
      const department = await ctx.db.get(args.departmentId);
      if (!department || department.status !== "active") throw new Error("DEPARTMENT_NOT_ACTIVE");
    }
    await ensureUniqueCode(ctx, "jobTitles", code);
    const operationId = requireOperationId(args.operationId);
    const now = Date.now();
    const id = await ctx.db.insert("jobTitles", {
      code, name, description: clean(args.description), departmentId: args.departmentId,
      grade: clean(args.grade), status: "active", createdAt: now, updatedAt: now, createdBy: user._id,
    });
    await record(ctx, undefined, "hr.job_title.create", "job_title", id, operationId, { code, name, departmentId: args.departmentId });
    return { success: true, id };
  },
});

export const listJobTitles = query({
  args: { departmentId: v.optional(v.id("departments")) },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "hr.structure.manage");
    const rows = args.departmentId
      ? await ctx.db.query("jobTitles").withIndex("by_department", q => q.eq("departmentId", args.departmentId!)).collect()
      : await ctx.db.query("jobTitles").collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  },
});


// Controlled updates for organizational master data
export const updateCompany = mutation({
  args: {
    companyId: v.id("companies"), name: v.optional(v.string()),
    legalName: v.optional(v.string()), taxNumber: v.optional(v.string()),
    address: v.optional(v.string()), phone: v.optional(v.string()),
    email: v.optional(v.string()), status: v.optional(ACTIVE), operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "hr.structure.manage");
    const current = await ctx.db.get(args.companyId);
    if (!current) throw new Error("COMPANY_NOT_FOUND");
    if (args.status === "inactive") {
      const departments = await ctx.db.query("departments")
        .withIndex("by_company", q => q.eq("companyId", args.companyId)).collect();
      const employees = await ctx.db.query("employees")
        .withIndex("by_company", q => q.eq("companyId", args.companyId)).collect();
      if (departments.some(item => item.status === "active") || employees.some(item => item.status !== "terminated")) {
        throw new Error("COMPANY_HAS_ACTIVE_DEPENDENCIES");
      }
    }
    const operationId = requireOperationId(args.operationId);
    const patch: any = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = requireText(args.name, "company_name");
    if (args.legalName !== undefined) patch.legalName = clean(args.legalName);
    if (args.taxNumber !== undefined) patch.taxNumber = clean(args.taxNumber);
    if (args.address !== undefined) patch.address = clean(args.address);
    if (args.phone !== undefined) patch.phone = clean(args.phone);
    if (args.email !== undefined) patch.email = clean(args.email)?.toLowerCase();
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.companyId, patch);
    await record(ctx, undefined, "hr.company.update", "company", args.companyId, operationId,
      { changedFields: Object.keys(patch).filter(key => key !== "updatedAt"), previousStatus: current.status, newStatus: args.status ?? current.status, actorUserId: user._id });
    return { success: true, updated: true };
  },
});

export const updateDepartment = mutation({
  args: {
    departmentId: v.id("departments"), name: v.optional(v.string()),
    stationId: v.optional(v.id("stations")), parentDepartmentId: v.optional(v.id("departments")),
    description: v.optional(v.string()), status: v.optional(ACTIVE), operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "hr.structure.manage");
    const current = await ctx.db.get(args.departmentId);
    if (!current) throw new Error("DEPARTMENT_NOT_FOUND");
    if (args.stationId) {
      const station = await ctx.db.get(args.stationId);
      if (!station || station.status !== "active") throw new Error("STATION_NOT_ACTIVE");
    }
    const effectiveStationId = args.stationId === undefined ? current.stationId : args.stationId;
    const effectiveParentDepartmentId = args.parentDepartmentId === undefined
      ? current.parentDepartmentId
      : args.parentDepartmentId;
    await validateDepartmentParent(
      ctx,
      current.companyId,
      effectiveParentDepartmentId,
      current._id,
      effectiveStationId
    );
    if (args.status === "inactive") {
      const employees = await ctx.db.query("employees")
        .withIndex("by_department", q => q.eq("departmentId", args.departmentId)).collect();
      const children = await ctx.db.query("departments")
        .withIndex("by_parent", q => q.eq("parentDepartmentId", args.departmentId)).collect();
      if (employees.some(item => item.status !== "terminated") || children.some(item => item.status === "active")) {
        throw new Error("DEPARTMENT_HAS_ACTIVE_DEPENDENCIES");
      }
    }
    const operationId = requireOperationId(args.operationId);
    const patch: any = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = requireText(args.name, "department_name");
    if (args.stationId !== undefined || stationId !== current.stationId) patch.stationId = stationId;
    if (args.parentDepartmentId !== undefined) patch.parentDepartmentId = args.parentDepartmentId;
    if (args.description !== undefined) patch.description = clean(args.description);
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.departmentId, patch);
    await record(ctx, args.stationId ?? current.stationId, "hr.department.update", "department", args.departmentId, operationId,
      { changedFields: Object.keys(patch).filter(key => key !== "updatedAt"), previousStatus: current.status, newStatus: args.status ?? current.status });
    return { success: true, updated: true };
  },
});

export const updateJobTitle = mutation({
  args: {
    jobTitleId: v.id("jobTitles"), name: v.optional(v.string()),
    description: v.optional(v.string()), departmentId: v.optional(v.id("departments")),
    grade: v.optional(v.string()), status: v.optional(ACTIVE), operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "hr.structure.manage");
    const current = await ctx.db.get(args.jobTitleId);
    if (!current) throw new Error("JOB_TITLE_NOT_FOUND");
    const departmentId = args.departmentId === undefined ? current.departmentId : args.departmentId;
    if (departmentId) {
      const department = await ctx.db.get(departmentId);
      if (!department || department.status !== "active") throw new Error("DEPARTMENT_NOT_ACTIVE");
    }
    if (args.status === "inactive") {
      const employees = await ctx.db.query("employees")
        .withIndex("by_jobTitle", q => q.eq("jobTitleId", args.jobTitleId)).collect();
      if (employees.some(item => item.status !== "terminated")) throw new Error("JOB_TITLE_HAS_ACTIVE_EMPLOYEES");
    }
    const operationId = requireOperationId(args.operationId);
    const patch: any = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = requireText(args.name, "job_title_name");
    if (args.description !== undefined) patch.description = clean(args.description);
    if (args.departmentId !== undefined) patch.departmentId = args.departmentId;
    if (args.grade !== undefined) patch.grade = clean(args.grade);
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.jobTitleId, patch);
    await record(ctx, undefined, "hr.job_title.update", "job_title", args.jobTitleId, operationId,
      { changedFields: Object.keys(patch).filter(key => key !== "updatedAt"), previousStatus: current.status, newStatus: args.status ?? current.status });
    return { success: true, updated: true };
  },
});

// Employee master file
export const createEmployee = mutation({
  args: {
    employeeNo: v.string(), fullName: v.string(), nationalId: v.optional(v.string()),
    email: v.optional(v.string()), mobile: v.optional(v.string()), birthDate: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"))),
    companyId: v.id("companies"), stationId: v.optional(v.id("stations")),
    departmentId: v.id("departments"), jobTitleId: v.id("jobTitles"),
    managerEmployeeId: v.optional(v.id("employees")),
    employmentType: v.union(v.literal("permanent"), v.literal("contract"), v.literal("temporary"), v.literal("daily")),
    hireDate: v.string(), notes: v.optional(v.string()), operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "hr.employees.manage");
    const employeeNo = requireText(args.employeeNo, "employee_number", 40).toUpperCase();
    const fullName = requireText(args.fullName, "employee_name");
    const hireDate = requireText(args.hireDate, "hire_date", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) throw new Error("INVALID_HIRE_DATE");
    const company = await ctx.db.get(args.companyId);
    const department = await ctx.db.get(args.departmentId);
    const jobTitle = await ctx.db.get(args.jobTitleId);
    if (!company || company.status !== "active") throw new Error("COMPANY_NOT_ACTIVE");
    if (!department || department.status !== "active" || department.companyId !== args.companyId) {
      throw new Error("DEPARTMENT_COMPANY_MISMATCH");
    }
    if (!jobTitle || jobTitle.status !== "active" ||
        (jobTitle.departmentId && jobTitle.departmentId !== args.departmentId)) {
      throw new Error("JOB_TITLE_DEPARTMENT_MISMATCH");
    }
    const stationId = args.stationId ?? department.stationId;
    if (department.stationId && stationId !== department.stationId) {
      throw new Error("STATION_DEPARTMENT_MISMATCH");
    }
    if (stationId) {
      const station = await ctx.db.get(stationId);
      if (!station || station.status !== "active") throw new Error("STATION_NOT_ACTIVE");
    }
    if (args.managerEmployeeId) {
      const manager = await ctx.db.get(args.managerEmployeeId);
      if (!manager || manager.companyId !== args.companyId || manager.status !== "active") {
        throw new Error("INVALID_MANAGER");
      }
    }
    const duplicates = await ctx.db.query("employees")
      .withIndex("by_employeeNo", q => q.eq("employeeNo", employeeNo)).take(2);
    if (duplicates.length) throw new Error("DUPLICATE_EMPLOYEE_NUMBER");
    const nationalId = clean(args.nationalId);
    if (nationalId) {
      const found = await ctx.db.query("employees").withIndex("by_nationalId", q => q.eq("nationalId", nationalId)).take(2);
      if (found.length) throw new Error("DUPLICATE_NATIONAL_ID");
    }
    const email = clean(args.email)?.toLowerCase();
    if (email) {
      const found = await ctx.db.query("employees").withIndex("by_email", q => q.eq("email", email)).take(2);
      if (found.length) throw new Error("DUPLICATE_EMPLOYEE_EMAIL");
    }
    const operationId = requireOperationId(args.operationId);
    const now = Date.now();
    const id = await ctx.db.insert("employees", {
      employeeNo, fullName, nationalId, email, mobile: clean(args.mobile), birthDate: clean(args.birthDate),
      gender: args.gender, companyId: args.companyId, stationId,
      departmentId: args.departmentId, jobTitleId: args.jobTitleId, managerEmployeeId: args.managerEmployeeId,
      employmentType: args.employmentType, hireDate, status: "active", notes: clean(args.notes),
      createdAt: now, updatedAt: now, createdBy: user._id,
    });
    await record(ctx, stationId, "hr.employee.create", "employee", id, operationId,
      { employeeNo, fullName, companyId: args.companyId, departmentId: args.departmentId, jobTitleId: args.jobTitleId });
    return { success: true, id };
  },
});

export const listEmployees = query({
  args: {
    companyId: v.optional(v.id("companies")), stationId: v.optional(v.id("stations")),
    departmentId: v.optional(v.id("departments")), status: v.optional(EMPLOYEE_STATUSES),
  },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "hr.employees.manage");
    let rows = args.departmentId
      ? await ctx.db.query("employees").withIndex("by_department", q => q.eq("departmentId", args.departmentId!)).collect()
      : args.stationId
        ? await ctx.db.query("employees").withIndex("by_station", q => q.eq("stationId", args.stationId!)).collect()
        : args.companyId
          ? await ctx.db.query("employees").withIndex("by_company", q => q.eq("companyId", args.companyId!)).collect()
          : await ctx.db.query("employees").collect();
    if (args.companyId) rows = rows.filter(row => row.companyId === args.companyId);
    if (args.stationId) rows = rows.filter(row => row.stationId === args.stationId);
    if (args.status) rows = rows.filter(row => row.status === args.status);
    return rows.sort((a, b) => a.employeeNo.localeCompare(b.employeeNo, "en"));
  },
});

export const updateEmployee = mutation({
  args: {
    employeeId: v.id("employees"), fullName: v.optional(v.string()), mobile: v.optional(v.string()),
    email: v.optional(v.string()), stationId: v.optional(v.id("stations")),
    departmentId: v.optional(v.id("departments")), jobTitleId: v.optional(v.id("jobTitles")),
    managerEmployeeId: v.optional(v.id("employees")), status: v.optional(EMPLOYEE_STATUSES),
    notes: v.optional(v.string()), operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "hr.employees.manage");
    const current = await ctx.db.get(args.employeeId);
    if (!current) throw new Error("EMPLOYEE_NOT_FOUND");
    const departmentId = args.departmentId ?? current.departmentId;
    const jobTitleId = args.jobTitleId ?? current.jobTitleId;
    const department = await ctx.db.get(departmentId);
    const jobTitle = await ctx.db.get(jobTitleId);
    if (!department || department.companyId !== current.companyId || department.status !== "active") {
      throw new Error("DEPARTMENT_COMPANY_MISMATCH");
    }
    if (!jobTitle || jobTitle.status !== "active" || (jobTitle.departmentId && jobTitle.departmentId !== departmentId)) {
      throw new Error("JOB_TITLE_DEPARTMENT_MISMATCH");
    }
    const stationId = args.stationId === undefined
      ? (current.stationId ?? department.stationId)
      : args.stationId;
    if (department.stationId && stationId !== department.stationId) {
      throw new Error("STATION_DEPARTMENT_MISMATCH");
    }
    if (stationId) {
      const station = await ctx.db.get(stationId);
      if (!station || station.status !== "active") throw new Error("STATION_NOT_ACTIVE");
    }
    const email = args.email === undefined ? current.email : clean(args.email)?.toLowerCase();
    if (email && email !== current.email) {
      const found = await ctx.db.query("employees").withIndex("by_email", q => q.eq("email", email)).take(2);
      if (found.some(row => row._id !== current._id)) throw new Error("DUPLICATE_EMPLOYEE_EMAIL");
    }
    if (args.managerEmployeeId) {
      const manager = await ctx.db.get(args.managerEmployeeId);
      if (!manager || manager.companyId !== current.companyId || manager._id === current._id || manager.status !== "active") {
        throw new Error("INVALID_MANAGER");
      }
    }
    const operationId = requireOperationId(args.operationId);
    const patch: any = { updatedAt: Date.now() };
    if (args.fullName !== undefined) patch.fullName = requireText(args.fullName, "employee_name");
    if (args.mobile !== undefined) patch.mobile = clean(args.mobile);
    if (args.email !== undefined) patch.email = email;
    if (args.stationId !== undefined) patch.stationId = args.stationId;
    if (args.departmentId !== undefined) patch.departmentId = departmentId;
    if (args.jobTitleId !== undefined) patch.jobTitleId = jobTitleId;
    if (args.managerEmployeeId !== undefined) patch.managerEmployeeId = args.managerEmployeeId;
    if (args.status !== undefined) patch.status = args.status;
    if (args.notes !== undefined) patch.notes = clean(args.notes);
    await ctx.db.patch(args.employeeId, patch);
    await record(ctx, stationId, "hr.employee.update", "employee", args.employeeId, operationId,
      { changedFields: Object.keys(patch).filter(key => key !== "updatedAt"), previousStatus: current.status, newStatus: args.status ?? current.status });
    return { success: true, updated: true };
  },
});
