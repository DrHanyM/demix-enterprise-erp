import { query } from "./_generated/server";
import { requireCentralPermission } from "./lib/auth";

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireCentralPermission(ctx, "system.users.manage");

    const identity = await ctx.auth.getUserIdentity();
    const users = await ctx.db
      .query("users")
      .collect();

    const result = users
      .map((user) => ({
        id: user._id,
        email: user.email,
        isCurrentUser: user.authSubject === identity?.subject,
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
