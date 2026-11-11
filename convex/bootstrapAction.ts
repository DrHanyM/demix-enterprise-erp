"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";

export const bootstrapFirstCentralAdmin = action({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    permissionsCount: number;
    permissionCodes: string[];
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHENTICATED");

    const allowedSubject = process.env.DEMIX_BOOTSTRAP_CLERK_SUBJECT;
    if (!allowedSubject || identity.subject !== allowedSubject) {
      throw new Error("BOOTSTRAP_FORBIDDEN");
    }

    const email = identity.email;
    const name = identity.name;
    if (!email || !name) throw new Error("BOOTSTRAP_PROFILE_INCOMPLETE");

    return await ctx.runMutation(internal.bootstrap.createFirstCentralAdmin, {
      authSubject: identity.subject,
      email,
      fullName: name,
    });
  },
});
