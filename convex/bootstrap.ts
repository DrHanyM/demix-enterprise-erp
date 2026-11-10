import { internalMutation } from "./_generated/server";
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
  { code: "hr.structure.manage", name: "إدارة الشركات والهيكل التنظيمي", module: "hr.structure", action: "manage", description: "إدارة الشركات والإدارات والمسميات الوظيفية." },
  { code: "hr.employees.manage", name: "إدارة ملفات الموظفين", module: "hr.employees", action: "manage", description: "عرض وإدارة ملفات الموظفين وبياناتهم الأساسية." },
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

    const existingUsers = await ctx.db
      .query("users")
      .withIndex("by_authSubject", q => q.eq("authSubject", authSubject))
      .take(2);
    if (existingUsers.length > 1) throw new Error("BOOTSTRAP_DUPLICATE_USER");

    let user = existingUsers[0] ?? null;
    let role: any = null;
    const now = Date.now();

    if (!user) {
      const anyUsers = await ctx.db.query("users").take(1);
      const anyRoles = await ctx.db.query("roles").take(1);
      if (anyUsers.length || anyRoles.length) throw new Error("BOOTSTRAP_ALREADY_CLOSED");

      const userId = await ctx.db.insert("users", {
        authSubject, email, fullName, status: "active",
        createdAt: now, updatedAt: now, createdBy: "SECURE_PREVIEW_BOOTSTRAP",
      });
      user = await ctx.db.get(userId);
      if (!user) throw new Error("BOOTSTRAP_USER_CREATE_FAILED");

      const roleId = await ctx.db.insert("roles", {
        code: "CENTRAL_SUPER_ADMIN",
        name: "المسؤول الأعلى للإدارة المركزية",
        description: "الدور الأعلى لإدارة النظام مركزيًا.",
        scope: "central", status: "active", isSystem: true,
        createdAt: now, updatedAt: now,
      });
      role = await ctx.db.get(roleId);
      await ctx.db.insert("centralUserRoles", {
        userId, roleId, status: "active", assignedAt: now, assignedBy: authSubject,
      });
    } else {
      if (user.status !== "active") throw new Error("BOOTSTRAP_USER_NOT_ACTIVE");
      const assignments = await ctx.db.query("centralUserRoles")
        .withIndex("by_user", q => q.eq("userId", user!._id))
        .collect();
      const centralRoles = [];
      for (const assignment of assignments) {
        if (assignment.status !== "active") continue;
        const candidate = await ctx.db.get(assignment.roleId);
        if (candidate?.code === "CENTRAL_SUPER_ADMIN" && candidate.scope === "central" && candidate.status === "active") {
          centralRoles.push(candidate);
        }
      }
      if (centralRoles.length !== 1) throw new Error("BOOTSTRAP_EXISTING_ADMIN_NOT_UNIQUE");
      role = centralRoles[0];
    }

    if (!role || role.scope !== "central" || role.status !== "active" || role.code !== "CENTRAL_SUPER_ADMIN") {
      throw new Error("BOOTSTRAP_CENTRAL_ROLE_INVALID");
    }

    for (const item of PERMISSIONS) {
      const found = await ctx.db.query("permissions")
        .withIndex("by_code", q => q.eq("code", item.code))
        .take(2);
      if (found.length > 1) throw new Error("BOOTSTRAP_DUPLICATE_PERMISSION");

      const permissionId = found[0]?._id ?? await ctx.db.insert("permissions", { ...item, createdAt: now });
      const links = await ctx.db.query("rolePermissions")
        .withIndex("by_role_permission", q => q.eq("roleId", role._id).eq("permissionId", permissionId))
        .take(2);
      if (links.length > 1) throw new Error("BOOTSTRAP_DUPLICATE_ROLE_PERMISSION");
      if (links.length === 0) {
        await ctx.db.insert("rolePermissions", { roleId: role._id, permissionId, assignedAt: now });
      }
    }

    const roleLinks = await ctx.db.query("rolePermissions")
      .withIndex("by_role", q => q.eq("roleId", role._id))
      .collect();
    const permissionCodes: string[] = [];
    for (const link of roleLinks) {
      const permission = await ctx.db.get(link.permissionId);
      if (permission) permissionCodes.push(permission.code);
    }

    const operationId = `bootstrap-central-super-admin-v1-${authSubject}`;
    const existingAudit = await ctx.db.query("auditLogs")
      .withIndex("by_operation", q => q.eq("operationId", operationId))
      .first();
    if (!existingAudit) {
      await ctx.db.insert("auditLogs", {
        actorUserId: user._id,
        action: "system.central_admin.bootstrap",
        entityType: "central_role",
        entityId: role._id,
        operationId,
        details: { roleCode: "CENTRAL_SUPER_ADMIN", permissionsCount: permissionCodes.length, permissionCodes },
        createdAt: now,
      });
    }

    return { success: true, permissionsCount: permissionCodes.length, permissionCodes };
  },
});
