import { query } from "./_generated/server";
import { v } from "convex/values";
import { hasRolePermission, requireCentralPermission } from "./lib/auth";

// Safe capability check for conditional UI rendering. This does not expose user data
// and does not replace authorization checks on protected queries and mutations.
export const canManageUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", identity.subject))
      .unique();
    if (!user || user.status !== "active") return false;

    const assignments = await ctx.db
      .query("centralUserRoles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const assignment of assignments) {
      if (assignment.status !== "active") continue;
      const role = await ctx.db.get(assignment.roleId);
      if (
        role &&
        role.status === "active" &&
        role.scope === "central" &&
        await hasRolePermission(ctx, role._id, "system.users.manage")
      ) {
        return true;
      }
    }
    return false;
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireCentralPermission(ctx, "system.users.manage");

    const users = await ctx.db
      .query("users")
      .collect();

    const result = users
      .map((user) => ({
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);

    return {
      total: result.length,
      users: result,
    };
  },
});

// تفاصيل الوصول الفعلي للمستخدم: الأدوار، المحطات، والصلاحيات المرتبطة بها.
export const getUserAccessDetails = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "system.users.manage");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("USER_NOT_FOUND");

    const stationAssignments = await ctx.db
      .query("userStations")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const stationDetails = await Promise.all(
      stationAssignments.map(async (assignment) => {
        const [station, role, links] = await Promise.all([
          ctx.db.get(assignment.stationId),
          ctx.db.get(assignment.roleId),
          ctx.db.query("rolePermissions")
            .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
            .collect(),
        ]);
        const permissions = await Promise.all(
          links.map(async (link) => {
            const permission = await ctx.db.get(link.permissionId);
            return permission
              ? { code: permission.code, name: permission.name, module: permission.module, action: permission.action }
              : null;
          })
        );
        return {
          assignmentStatus: assignment.status,
          assignedAt: assignment.assignedAt,
          station: station ? { id: station._id, code: station.code, name: station.name, status: station.status } : null,
          role: role ? { code: role.code, name: role.name, scope: role.scope, status: role.status } : null,
          permissions: permissions.filter((item): item is NonNullable<typeof item> => item !== null),
        };
      })
    );

    const centralAssignments = await ctx.db
      .query("centralUserRoles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const centralDetails = await Promise.all(
      centralAssignments.map(async (assignment) => {
        const [role, links] = await Promise.all([
          ctx.db.get(assignment.roleId),
          ctx.db.query("rolePermissions")
            .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
            .collect(),
        ]);
        const permissions = await Promise.all(
          links.map(async (link) => {
            const permission = await ctx.db.get(link.permissionId);
            return permission
              ? { code: permission.code, name: permission.name, module: permission.module, action: permission.action }
              : null;
          })
        );
        return {
          assignmentStatus: assignment.status,
          role: role ? { code: role.code, name: role.name, scope: role.scope, status: role.status } : null,
          permissions: permissions.filter((item): item is NonNullable<typeof item> => item !== null),
        };
      })
    );

    return {
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      stationAssignments: stationDetails,
      centralAssignments: centralDetails,
    };
  },
});

