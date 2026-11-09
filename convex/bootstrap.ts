import { mutation } from "./_generated/server";

/**
 * One-time Preview bootstrap for the explicitly approved first central admin.
 * This is intentionally bound to one Clerk subject and one verified account.
 * It refuses to run if any core authorization data already exists.
 */
const APPROVED_CLERK_SUBJECT = "user_3Lg5WNRTzqqhUihdy8EjcLBwuo1";
const APPROVED_EMAIL = "hanymohamed15121974@gmail.com";

const CENTRAL_ADMIN_PERMISSIONS = [
  ["system.users.manage", "Manage users", "system", "users"],
  ["system.stations.manage", "Manage stations", "system", "stations"],
  ["audit.view", "View audit log", "audit", "view"],
] as const;

export const bootstrapCentralAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHENTICATED");
    if (identity.subject !== APPROVED_CLERK_SUBJECT) {
      throw new Error("BOOTSTRAP_NOT_AUTHORIZED");
    }

    const email = String(identity.email ?? "").trim().toLowerCase();
    if (email !== APPROVED_EMAIL) {
      throw new Error("BOOTSTRAP_VERIFIED_EMAIL_MISMATCH");
    }

    const [users, roles, permissions, rolePermissions, invitations, assignments, auditLogs] =
      await Promise.all([
        ctx.db.query("users").take(1),
        ctx.db.query("roles").take(1),
        ctx.db.query("permissions").take(1),
        ctx.db.query("rolePermissions").take(1),
        ctx.db.query("invitations").take(1),
        ctx.db.query("centralUserRoles").take(1),
        ctx.db.query("auditLogs").take(1),
      ]);

    if (
      users.length || roles.length || permissions.length ||
      rolePermissions.length || invitations.length ||
      assignments.length || auditLogs.length
    ) {
      throw new Error("BOOTSTRAP_REFUSED_DATABASE_NOT_EMPTY");
    }

    const now = Date.now();
    const fullName = String(identity.name ?? "DEMIX Central Administrator").trim();

    const userId = await ctx.db.insert("users", {
      authSubject: identity.subject,
      email,
      fullName,
      status: "active",
      createdAt: now,
      updatedAt: now,
      createdBy: "SECURE_ONE_TIME_BOOTSTRAP",
    });

    const roleId = await ctx.db.insert("roles", {
      code: "CENTRAL_SUPER_ADMIN",
      name: "Central Super Administrator",
      description: "System-wide central administrator",
      scope: "central",
      status: "active",
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    });

    const permissionIds = [];
    for (const [code, name, module, action] of CENTRAL_ADMIN_PERMISSIONS) {
      const permissionId = await ctx.db.insert("permissions", {
        code, name, module, action,
        description: `Central administrator permission: ${code}`,
        createdAt: now,
      });
      permissionIds.push(permissionId);
    }

    for (const permissionId of permissionIds) {
      await ctx.db.insert("rolePermissions", {
        roleId,
        permissionId,
        assignedAt: now,
      });
    }

    await ctx.db.insert("centralUserRoles", {
      userId,
      roleId,
      status: "active",
      assignedAt: now,
      assignedBy: "SECURE_ONE_TIME_BOOTSTRAP",
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      action: "system.central_admin.bootstrap",
      entityType: "user",
      entityId: userId,
      operationId: `bootstrap-central-super-admin-v1-${identity.subject}`,
      details: {
        source: "SECURE_ONE_TIME_BOOTSTRAP",
        roleCode: "CENTRAL_SUPER_ADMIN",
        permissions: CENTRAL_ADMIN_PERMISSIONS.map(([code]) => code),
      },
      createdAt: now,
    });

    return {
      success: true,
      userId,
      roleId,
      permissionsCreated: permissionIds.length,
      auditLogCreated: true,
    };
  },
});
