import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const PERMISSIONS = [
  { code: "system.users.manage", name: "إدارة المستخدمين", module: "system.users", action: "manage", description: "إنشاء المستخدمين ودعوتهم وإدارة حساباتهم." },
  { code: "system.stations.manage", name: "إدارة المحطات", module: "system.stations", action: "manage", description: "إنشاء المحطات وتعديلها وتفعيلها أو تعطيلها." },
  { code: "audit.view", name: "عرض سجل التدقيق", module: "audit", action: "view", description: "عرض سجل العمليات والأحداث الرقابية." },
  { code: "system.roles.manage", name: "إدارة الأدوار", module: "system.roles", action: "manage", description: "إدارة الأدوار وربط الصلاحيات بها." },
  { code: "system.permissions.manage", name: "إدارة الصلاحيات", module: "system.permissions", action: "manage", description: "إدارة تعريفات الصلاحيات داخل النظام." },
  { code: "system.settings.manage", name: "إدارة إعدادات النظام", module: "system.settings", action: "manage", description: "إدارة الإعدادات العامة للنظام." },
  { code: "production.view", name: "عرض الإنتاج", module: "production", action: "view", description: "عرض بيانات وتقارير الإنتاج." },
  { code: "production.manage", name: "إدارة الإنتاج", module: "production", action: "manage", description: "إدارة عمليات وبيانات الإنتاج." },
  { code: "quality.view", name: "عرض الجودة", module: "quality", action: "view", description: "عرض بيانات الجودة والاختبارات." },
  { code: "quality.manage", name: "إدارة الجودة", module: "quality", action: "manage", description: "إدارة بيانات الجودة والاختبارات." },
  { code: "inventory.view", name: "عرض المخزون", module: "inventory", action: "view", description: "عرض أرصدة وحركات المخزون." },
  { code: "inventory.manage", name: "إدارة المخزون", module: "inventory", action: "manage", description: "إدارة الأصناف والأرصدة وحركات المخزون." },
  { code: "reports.view", name: "عرض التقارير", module: "reports", action: "view", description: "عرض التقارير التشغيلية والإدارية." },
] as const;

export const createFirstCentralAdmin = internalMutation({
  args: {
    authSubject: v.string(),
    email: v.string(),
    fullName: v.string(),
  },
  handler: async (ctx, args) => {
    const authSubject = args.authSubject.trim();
    const email = args.email.trim().toLowerCase();
    const fullName = args.fullName.trim();
    if (!authSubject || !email || !fullName) throw new Error("BOOTSTRAP_INVALID_IDENTITY");

    const users = await ctx.db.query("users").take(1);
    const roles = await ctx.db.query("roles").take(1);
    if (users.length || roles.length) throw new Error("BOOTSTRAP_ALREADY_CLOSED");

    const existingAudit = await ctx.db.query("auditLogs")
      .withIndex("by_operation", q => q.eq("operationId", `bootstrap-central-super-admin-v1-${authSubject}`))
      .first();
    if (existingAudit) throw new Error("BOOTSTRAP_ALREADY_COMPLETED");

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      authSubject, email, fullName, status: "active",
      createdAt: now, updatedAt: now, createdBy: "SECURE_PREVIEW_BOOTSTRAP",
    });
    const roleId = await ctx.db.insert("roles", {
      code: "CENTRAL_SUPER_ADMIN",
      name: "المسؤول الأعلى للإدارة المركزية",
      description: "الدور الأعلى لإدارة النظام مركزيًا.",
      scope: "central", status: "active", isSystem: true,
      createdAt: now, updatedAt: now,
    });

    const codes: string[] = [];
    for (const item of PERMISSIONS) {
      const duplicate = await ctx.db.query("permissions")
        .withIndex("by_code", q => q.eq("code", item.code)).first();
      if (duplicate) throw new Error("BOOTSTRAP_PERMISSION_CONFLICT");
      const permissionId = await ctx.db.insert("permissions", { ...item, createdAt: now });
      await ctx.db.insert("rolePermissions", { roleId, permissionId, assignedAt: now });
      codes.push(item.code);
    }

    await ctx.db.insert("centralUserRoles", {
      userId, roleId, status: "active", assignedAt: now, assignedBy: authSubject,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId, action: "system.central_admin.bootstrap",
      entityType: "central_role", entityId: roleId,
      operationId: `bootstrap-central-super-admin-v1-${authSubject}`,
      details: { roleCode: "CENTRAL_SUPER_ADMIN", permissionsCount: codes.length, permissionCodes: codes },
      createdAt: now,
    });
    return { success: true, permissionsCount: codes.length, permissionCodes: codes };
  },
});


// Read-only Preview bootstrap preflight. Returns counts only, never document data.
export const getBootstrapDataCounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [users, roles, permissions, centralUserRoles] = await Promise.all([
      ctx.db.query("users").take(1001),
      ctx.db.query("roles").take(1001),
      ctx.db.query("permissions").take(1001),
      ctx.db.query("centralUserRoles").take(1001),
    ]);

    const summarize = (rows: unknown[]) => ({
      count: Math.min(rows.length, 1000),
      capped: rows.length > 1000,
    });

    return {
      users: summarize(users),
      roles: summarize(roles),
      permissions: summarize(permissions),
      centralUserRoles: summarize(centralUserRoles),
    };
  },
});
