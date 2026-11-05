
import { query } from "./_generated/server";

export const verifyCentralAdmin = query({
  handler: async (ctx) => {
    // 1. Verify authenticated identity
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("يجب تسجيل الدخول أولاً.");
    }

    // 2. Find the current user
    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) =>
        q.eq("authSubject", identity.subject)
      )
      .unique();

    if (!user) {
      return {
        verified: false,
        message: "لم يتم العثور على سجل المستخدم في Convex.",
      };
    }

    // 3. Find active central role assignments
    const assignments = await ctx.db
      .query("centralUserRoles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const activeAssignments = assignments.filter(
      (item) => item.status === "active"
    );

    let adminRole = null;
    let permissionCodes: string[] = [];

    // 4. Find CENTRAL_SUPER_ADMIN role and its permissions
    for (const assignment of activeAssignments) {
      const role = await ctx.db.get(assignment.roleId);

      if (role?.code === "CENTRAL_SUPER_ADMIN") {
        adminRole = role;

        const rolePermissions = await ctx.db
          .query("rolePermissions")
          .withIndex("by_role", (q) =>
            q.eq("roleId", role._id)
          )
          .collect();

        const permissions = await Promise.all(
          rolePermissions.map((item) =>
            ctx.db.get(item.permissionId)
          )
        );

        permissionCodes = permissions
          .filter((item) => item !== null)
          .map((item) => item.code)
          .sort();

        break;
      }
    }

    // 5. Verify bootstrap audit record
    const auditLog = await ctx.db
      .query("auditLogs")
      .withIndex("by_operation", (q) =>
        q.eq(
          "operationId",
          `bootstrap-central-super-admin-v1-${identity.subject}`
        )
      )
      .unique();

    // 6. Return verification report
    return {
      verified:
        user.status === "active" &&
        adminRole !== null &&
        adminRole.status === "active" &&
        adminRole.scope === "central" &&
        adminRole.isSystem === true &&
        permissionCodes.length === 13 &&
        auditLog !== null,

      user: {
        fullName: user.fullName,
        email: user.email,
        status: user.status,
      },

      role: adminRole
        ? {
            code: adminRole.code,
            name: adminRole.name,
            scope: adminRole.scope,
            status: adminRole.status,
            isSystem: adminRole.isSystem,
          }
        : null,

      permissionsCount: permissionCodes.length,
      permissions: permissionCodes,
      auditLogExists: auditLog !== null,
    };
  },
});
