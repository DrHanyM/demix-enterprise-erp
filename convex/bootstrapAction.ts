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

type BootstrapTableCount = { count: number; capped: boolean };
type BootstrapDataCounts = {
  users: BootstrapTableCount;
  roles: BootstrapTableCount;
  permissions: BootstrapTableCount;
  centralUserRoles: BootstrapTableCount;
};

// Temporary Preview-only identity and read-only data diagnostic.
// Returns boolean identity flags and table counts only; never exposes profile data.
export const inspectBootstrapIdentity = action({
  args: {},
  handler: async (ctx): Promise<{
    authenticated: boolean;
    hasEmail: boolean;
    hasName: boolean;
    subjectMatchesAllowlist: boolean;
    dataCounts: BootstrapDataCounts | null;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    const allowedSubject = process.env.DEMIX_BOOTSTRAP_CLERK_SUBJECT;

    const subjectMatchesAllowlist =
      !!identity && !!allowedSubject && identity.subject === allowedSubject;

    const dataCounts = subjectMatchesAllowlist
      ? await ctx.runQuery(internal.bootstrap.getBootstrapDataCounts, {})
      : null;

    return {
      authenticated: !!identity,
      hasEmail: !!identity?.email,
      hasName: !!identity?.name,
      subjectMatchesAllowlist,
      dataCounts,
    };
  },
});
