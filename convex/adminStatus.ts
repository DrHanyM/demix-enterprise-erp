import { query } from "./_generated/server";

const REQUIRED_PERMISSIONS = [
  "system.users.manage",
  "system.stations.manage",
  "audit.view",
  "system.roles.manage",
  "system.permissions.manage",
  "system.settings.manage",
  "production.view",
  "production.manage",
  "quality.view",
  "quality.manage",
  "inventory.view",
  "inventory.manage",
  "reports.view",
  "hr.structure.manage",
  "hr.employees.manage",
] as const;

export const verifyCentralAdmin = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("يجب تسجيل الدخول أولاً.");

    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", q => q.eq("authSubject", identity.subject))
      .unique();

    if (!user) {
      return { verified: false, message: "لم يتم العثور على سجل المستخدم في Convex." };
    }

    const assignments = await ctx.db
      .query("centralUserRoles")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .collect();

    let adminRole = null;
    let permissionCodes: string[] = [];

    for (const assignment of assignments) {
      if (assignment.status !== "active") continue;
      const role = await ctx.db.get(assignment.roleId);
      if (role?.code !== "CENTRAL_SUPER_ADMIN" || role.status !== "active" || role.scope !== "central") continue;

      adminRole = role;
      const rolePermissions = await ctx.db
        .query("rolePermissions")
        .withIndex("by_role", q => q.eq("roleId", role._id))
        .collect();
      const permissions = await Promise.all(rolePermissions.map(item => ctx.db.get(item.permissionId)));
      permissionCodes = permissions
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .map(item => item.code)
        .sort();
      break;
    }

    const auditLog = await ctx.db
      .query("auditLogs")
      .withIndex("by_operation", q => q.eq("operationId", `bootstrap-central-super-admin-v1-${identity.subject}`))
      .unique();

    const hasRequiredPermissions = REQUIRED_PERMISSIONS.every(code => permissionCodes.includes(code));

    return {
      verified:
        user.status === "active" &&
        adminRole !== null &&
        adminRole.isSystem === true &&
        hasRequiredPermissions &&
        auditLog !== null,
      user: { fullName: user.fullName, email: user.email, status: user.status },
      role: adminRole
        ? { code: adminRole.code, name: adminRole.name, scope: adminRole.scope, status: adminRole.status, isSystem: adminRole.isSystem }
        : null,
      permissionsCount: permissionCodes.length,
      permissions: permissionCodes,
      missingPermissions: REQUIRED_PERMISSIONS.filter(code => !permissionCodes.includes(code)),
      auditLogExists: auditLog !== null,
    };
  },
});
