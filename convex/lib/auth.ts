
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type AuthContext = QueryCtx | MutationCtx;

type ActiveUser = Doc<"users">;
type ActiveRole = Doc<"roles">;

async function findActiveUser(
  ctx: AuthContext
): Promise<ActiveUser> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("UNAUTHENTICATED: يجب تسجيل الدخول.");
  }

  const users = await ctx.db
    .query("users")
    .withIndex("by_authSubject", (q) =>
      q.eq("authSubject", identity.subject)
    )
    .take(2);

  if (users.length !== 1) {
    throw new Error(
      "USER_NOT_FOUND: حساب المستخدم غير موجود أو مكرر."
    );
  }

  const user = users[0];

  if (user.status !== "active") {
    throw new Error(
      "USER_INACTIVE: الحساب غير نشط أو موقوف."
    );
  }

  return user;
}

/**
 * Verify that a role owns a specific permission.
 */
export async function hasRolePermission(
  ctx: AuthContext,
  roleId: Id<"roles">,
  permissionCode: string
): Promise<boolean> {
  const permissions = await ctx.db
    .query("permissions")
    .withIndex("by_code", (q) =>
      q.eq("code", permissionCode)
    )
    .take(2);

  if (permissions.length > 1) {
    throw new Error(
      "DUPLICATE_PERMISSION: يوجد تكرار في تعريف الصلاحية."
    );
  }

  if (permissions.length === 0) {
    return false;
  }

  const links = await ctx.db
    .query("rolePermissions")
    .withIndex("by_role_permission", (q) =>
      q
        .eq("roleId", roleId)
        .eq("permissionId", permissions[0]._id)
    )
    .take(2);

  if (links.length > 1) {
    throw new Error(
      "DUPLICATE_ROLE_PERMISSION: يوجد ربط مكرر للصلاحية."
    );
  }

  return links.length === 1;
}

/**
 * Find an active central role with the requested permission.
 */
async function findCentralRoleWithPermission(
  ctx: AuthContext,
  userId: Id<"users">,
  permissionCode: string
): Promise<ActiveRole | null> {
  const assignments = await ctx.db
    .query("centralUserRoles")
    .withIndex("by_user", (q) =>
      q.eq("userId", userId)
    )
    .collect();

  for (const assignment of assignments) {
    if (assignment.status !== "active") {
      continue;
    }

    const role = await ctx.db.get(assignment.roleId);

    if (
      !role ||
      role.status !== "active" ||
      role.scope !== "central"
    ) {
      continue;
    }

    if (
      await hasRolePermission(
        ctx,
        role._id,
        permissionCode
      )
    ) {
      return role;
    }
  }

  return null;
}

/**
 * Require an active authenticated user.
 */
export async function requireActiveUser(
  ctx: AuthContext
): Promise<ActiveUser> {
  return await findActiveUser(ctx);
}

/**
 * Require a central administration permission.
 */
export async function requireCentralPermission(
  ctx: AuthContext,
  permissionCode: string
): Promise<{
  user: ActiveUser;
  role: ActiveRole;
}> {
  const user = await findActiveUser(ctx);

  const role = await findCentralRoleWithPermission(
    ctx,
    user._id,
    permissionCode
  );

  if (!role) {
    throw new Error(
      `FORBIDDEN: لا تمتلك الصلاحية ${permissionCode}.`
    );
  }

  return { user, role };
}

/**
 * Require permission within a specific active station.
 * An authorized central role can access the station.
 * Station users must have an active assignment to that station.
 */
export async function requireStationPermission(
  ctx: AuthContext,
  stationId: Id<"stations">,
  permissionCode: string
): Promise<{
  user: ActiveUser;
  station: Doc<"stations">;
  roles: ActiveRole[];
}> {
  const user = await findActiveUser(ctx);

  const station = await ctx.db.get(stationId);

  if (!station || station.status !== "active") {
    throw new Error(
      "STATION_INACTIVE: المحطة غير موجودة أو غير نشطة."
    );
  }

  // Central administration access
  const centralRole = await findCentralRoleWithPermission(
    ctx,
    user._id,
    permissionCode
  );

  if (centralRole) {
    return {
      user,
      station,
      roles: [centralRole],
    };
  }

  // Station-specific access
  const assignments = await ctx.db
    .query("userStations")
    .withIndex("by_user_station", (q) =>
      q
        .eq("userId", user._id)
        .eq("stationId", stationId)
    )
    .collect();

  const authorizedRoles: ActiveRole[] = [];

  for (const assignment of assignments) {
    if (assignment.status !== "active") {
      continue;
    }

    const role = await ctx.db.get(assignment.roleId);

    if (
      !role ||
      role.status !== "active" ||
      role.scope !== "station"
    ) {
      continue;
    }

    if (
      await hasRolePermission(
        ctx,
        role._id,
        permissionCode
      )
    ) {
      authorizedRoles.push(role);
    }
  }

  if (authorizedRoles.length === 0) {
    throw new Error(
      `FORBIDDEN: لا تمتلك الصلاحية ${permissionCode} في هذه المحطة.`
    );
  }

  return {
    user,
    station,
    roles: authorizedRoles,
  };
}
