import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { requireCentralPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

// ======================================================
// إنشاء سجل دعوة مبدئي
// ======================================================


const PRODUCTION_ROLE_CODE = "STATION_PRODUCTION_OPERATOR";
const PRODUCTION_PERMISSIONS = [
  ["production.records.read", "View production records", "production", "read"],
  ["production.records.create", "Create production records", "production", "create"],
  ["production.records.update", "Update production records", "production", "update"],
] as const;

async function ensureProductionRole(ctx: MutationCtx) {
  const now = Date.now();
  let role = await ctx.db.query("roles")
    .withIndex("by_code", (q) => q.eq("code", PRODUCTION_ROLE_CODE))
    .unique();

  if (!role) {
    const roleId = await ctx.db.insert("roles", {
      code: PRODUCTION_ROLE_CODE,
      name: "Station Production Operator",
      description: "Can read, create and update production records only at assigned stations.",
      scope: "station",
      status: "active",
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    });
    role = await ctx.db.get(roleId);
  }
  if (!role || role.scope !== "station" || role.status !== "active") {
    throw new Error("PRODUCTION_ROLE_CONFIGURATION_INVALID");
  }

  for (const [code, name, module, action] of PRODUCTION_PERMISSIONS) {
    let permission = await ctx.db.query("permissions")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!permission) {
      const permissionId = await ctx.db.insert("permissions", {
        code, name, module, action,
        description: "Station-scoped production permission.",
        createdAt: now,
      });
      permission = await ctx.db.get(permissionId);
    }
    if (!permission) throw new Error("PRODUCTION_PERMISSION_CONFIGURATION_INVALID");
    const link = await ctx.db.query("rolePermissions")
      .withIndex("by_role_permission", (q) =>
        q.eq("roleId", role._id).eq("permissionId", permission._id))
      .unique();
    if (!link) {
      await ctx.db.insert("rolePermissions", {
        roleId: role._id,
        permissionId: permission._id,
        assignedAt: now,
      });
    }
  }
  const allRoleLinks = await ctx.db.query("rolePermissions")
    .withIndex("by_role", (q) => q.eq("roleId", role._id))
    .collect();
  const expectedCodes = new Set(PRODUCTION_PERMISSIONS.map(([code]) => code));
  if (allRoleLinks.length !== expectedCodes.size) {
    throw new Error("PRODUCTION_ROLE_PERMISSION_SET_INVALID");
  }
  return role;
}

export const createInvitationDraft = mutation({
  args: {
    email: v.string(),
    fullName: v.string(),
    stationIds: v.array(v.id("stations")),
    operationId: v.string(),
  },

  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(
      ctx,
      "system.users.manage"
    );

    const email = args.email.trim().toLowerCase();
    const fullName = args.fullName.trim();
    const operationId = args.operationId.trim();
    const stationIds = [...new Set(args.stationIds)];
    if (stationIds.length < 1 || stationIds.length > 10 || stationIds.length !== args.stationIds.length) {
      throw new Error("INVALID_STATION_ASSIGNMENTS");
    }
    const role = await ensureProductionRole(ctx);
    for (const stationId of stationIds) {
      const station = await ctx.db.get(stationId);
      if (!station || station.status !== "active") throw new Error("INVITATION_STATION_INACTIVE");
    }

    // التحقق من البريد الإلكتروني
    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new Error("INVALID_EMAIL");
    }

    // التحقق من الاسم
    if (fullName.length < 2 || fullName.length > 120) {
      throw new Error("INVALID_FULL_NAME");
    }

    // التحقق من رقم العملية
    if (operationId.length < 10 || operationId.length > 150) {
      throw new Error("INVALID_OPERATION_ID");
    }

    // منع إعادة تنفيذ نفس الطلب
    const previousRequests = await ctx.db
      .query("invitations")
      .withIndex("by_operationId", (q) =>
        q.eq("operationId", operationId)
      )
      .take(2);

    if (previousRequests.length > 1) {
      throw new Error("DUPLICATE_OPERATION_ID");
    }

    if (previousRequests.length === 1) {
      const previous = previousRequests[0];

      if (
        previous.email !== email ||
        previous.fullName !== fullName ||
        previous.createdBy !== user._id ||
        previous.roleId !== role._id ||
        JSON.stringify(previous.stationIds ?? []) !== JSON.stringify(stationIds)
      ) {
        throw new Error("OPERATION_ID_CONFLICT");
      }

      return {
        success: true,
        created: false,
        invitationId: previous._id,
        status: previous.status,
      };
    }

    // منع دعوة مستخدم مسجل بالفعل
    const existingUsers = await ctx.db
      .query("users")
      .withIndex("by_email", (q) =>
        q.eq("email", email)
      )
      .take(2);

    if (existingUsers.length > 0) {
      throw new Error("USER_ALREADY_EXISTS");
    }

    // منع وجود دعوة أخرى ما زالت سارية
    const existingInvitations = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) =>
        q.eq("email", email)
      )
      .collect();

    const now = Date.now();

    const pendingInvitation = existingInvitations.find(
      (invitation) =>
        invitation.status === "inviting" ||
        (
          invitation.status === "invited" &&
          (!invitation.expiresAt || invitation.expiresAt > now)
        )
    );

    if (pendingInvitation) {
      throw new Error("ACTIVE_INVITATION_EXISTS");
    }

    // إنشاء سجل الدعوة
    const invitationId = await ctx.db.insert("invitations", {
      email,
      fullName,
      roleId: role._id,
      stationIds,
      status: "inviting",
      createdBy: user._id,
      operationId,
      createdAt: now,
      updatedAt: now,
    });

    // تسجيل العملية في سجل التدقيق
    await appendAuditLog(ctx, {
      action: "user.invitation.prepare",
      entityType: "invitation",
      entityId: invitationId,
      operationId: `invitation-prepare-${operationId}`,
      details: {
        email,
        fullName,
        roleCode: PRODUCTION_ROLE_CODE,
        stationIds,
        status: "inviting",
      },
    });

    return {
      success: true,
      created: true,
      invitationId,
      status: "inviting" as const,
    };
  },
});

// ======================================================
// عرض الدعوات للإدارة المركزية
// ======================================================

export const listInvitations = query({
  args: {},

  handler: async (ctx) => {
    await requireCentralPermission(
      ctx,
      "system.users.manage"
    );

    const invitations = await ctx.db
      .query("invitations")
      .collect();

    return invitations
      .map((invitation) => ({
        id: invitation._id,
        email: invitation.email,
        fullName: invitation.fullName,
        roleId: invitation.roleId,
        stationIds: invitation.stationIds,
        status: invitation.status,
        clerkInvitationId: invitation.clerkInvitationId,
        expiresAt: invitation.expiresAt,
        invitedAt: invitation.invitedAt,
        acceptedAt: invitation.acceptedAt,
        acceptedUserId: invitation.acceptedUserId,
        createdAt: invitation.createdAt,
        updatedAt: invitation.updatedAt,
        failureReason: invitation.failureReason,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ======================================================
// التحقق من الدعوة قبل إرسالها إلى Clerk
// ======================================================

export const getInvitationForSending = query({
  args: {
    invitationId: v.id("invitations"),
  },

  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(
      ctx,
      "system.users.manage"
    );

    const invitation = await ctx.db.get(args.invitationId);

    if (!invitation) {
      throw new Error("INVITATION_NOT_FOUND");
    }

    if (invitation.createdBy !== user._id) {
      throw new Error("INVITATION_ACCESS_DENIED");
    }

    if (invitation.status !== "inviting") {
      throw new Error("INVITATION_NOT_READY");
    }

    return {
      id: invitation._id,
      email: invitation.email,
      fullName: invitation.fullName,
      roleId: invitation.roleId,
      stationIds: invitation.stationIds,
      status: invitation.status,
    };
  },
});

// ======================================================
// تسجيل نجاح إرسال الدعوة
// ======================================================

export const markInvitationSent = mutation({
  args: {
    invitationId: v.id("invitations"),
    clerkInvitationId: v.string(),
    expiresAt: v.number(),
  },

  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(
      ctx,
      "system.users.manage"
    );

    const clerkInvitationId = args.clerkInvitationId.trim();

    if (!clerkInvitationId) {
      throw new Error("INVALID_CLERK_INVITATION_ID");
    }

    if (
      !Number.isFinite(args.expiresAt) ||
      args.expiresAt <= Date.now()
    ) {
      throw new Error("INVALID_INVITATION_EXPIRY");
    }

    const invitation = await ctx.db.get(args.invitationId);

    if (!invitation) {
      throw new Error("INVITATION_NOT_FOUND");
    }

    if (invitation.createdBy !== user._id) {
      throw new Error("INVITATION_ACCESS_DENIED");
    }

    // معالجة إعادة الطلب بأمان
    if (invitation.status === "invited") {
      if (invitation.clerkInvitationId === clerkInvitationId) {
        return {
          success: true,
          updated: false,
        };
      }

      throw new Error("INVITATION_ALREADY_SENT");
    }

    if (invitation.status !== "inviting") {
      throw new Error("INVITATION_NOT_READY");
    }

    // منع استخدام معرّف Clerk في أكثر من دعوة
    const duplicate = await ctx.db
      .query("invitations")
      .withIndex("by_clerkInvitationId", (q) =>
        q.eq("clerkInvitationId", clerkInvitationId)
      )
      .first();

    if (duplicate && duplicate._id !== invitation._id) {
      throw new Error("CLERK_INVITATION_ID_CONFLICT");
    }

    const now = Date.now();

    await ctx.db.patch(invitation._id, {
      status: "invited",
      clerkInvitationId,
      invitedAt: now,
      expiresAt: args.expiresAt,
      updatedAt: now,
      failureReason: undefined,
    });

    // تسجيل نجاح الإرسال
    await appendAuditLog(ctx, {
      action: "user.invitation.sent",
      entityType: "invitation",
      entityId: invitation._id,
      operationId: `invitation-sent-${invitation._id}`,
      details: {
        email: invitation.email,
        clerkInvitationId,
        status: "invited",
      },
    });

    return {
      success: true,
      updated: true,
    };
  },
});

// ======================================================
// تسجيل فشل إرسال الدعوة
// ======================================================

export const markInvitationFailed = mutation({
  args: {
    invitationId: v.id("invitations"),
    failureReason: v.string(),
  },

  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(
      ctx,
      "system.users.manage"
    );

    const invitation = await ctx.db.get(args.invitationId);

    if (!invitation) {
      throw new Error("INVITATION_NOT_FOUND");
    }

    if (invitation.createdBy !== user._id) {
      throw new Error("INVITATION_ACCESS_DENIED");
    }

    if (invitation.status !== "inviting") {
      return {
        success: false,
        updated: false,
      };
    }

    const now = Date.now();
    const reason = args.failureReason.trim().slice(0, 500);
    const finalReason = reason || "UNKNOWN_ERROR";

    await ctx.db.patch(invitation._id, {
      status: "failed",
      failureReason: finalReason,
      updatedAt: now,
    });

    // تسجيل فشل الإرسال
    await appendAuditLog(ctx, {
      action: "user.invitation.failed",
      entityType: "invitation",
      entityId: invitation._id,
      operationId: `invitation-failed-${invitation._id}`,
      details: {
        email: invitation.email,
        failureReason: finalReason,
        status: "failed",
      },
    });

    return {
      success: true,
      updated: true,
    };
  },
});

// ======================================================
// Clerk Webhook: Accept invitation and activate user
// Internal mutation - never exposed to client calls
// ======================================================

export const acceptInvitationFromClerk = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    clerkUserId: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
  },

  handler: async (ctx, args) => {
    const eventId = args.eventId.trim();
    const clerkUserId = args.clerkUserId.trim();
    const email = args.email.trim().toLowerCase();

    if (!eventId || eventId.length > 200) {
      throw new Error("INVALID_WEBHOOK_EVENT_ID");
    }

    if (!clerkUserId || clerkUserId.length > 200) {
      throw new Error("INVALID_CLERK_USER_ID");
    }

    if (!email || email.length > 254) {
      throw new Error("INVALID_USER_EMAIL");
    }

    if (
      args.eventType !== "user.created" &&
      args.eventType !== "user.updated"
    ) {
      throw new Error("UNSUPPORTED_CLERK_EVENT");
    }

    // Prevent duplicate webhook processing.
    const previousEvents = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(1);

    if (previousEvents.length > 0) {
      return {
        success: true,
        duplicate: true,
        status: "already_processed" as const,
      };
    }

    // Do not activate an account until its email is verified.
    // A later user.updated event can complete the process.
    if (!args.emailVerified) {
      return {
        success: false,
        duplicate: false,
        status: "email_not_verified" as const,
      };
    }

    const now = Date.now();

    // Resolve the ERP invitation using the verified primary email from Clerk.
    // Do not rely on custom Clerk public metadata being populated on acceptance.
    const emailInvitations = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();

    const matchingInvitations = emailInvitations.filter(
      (item) =>
        (item.status === "invited" || item.status === "accepted") &&
        typeof item.clerkInvitationId === "string" &&
        item.clerkInvitationId.length > 0
    );

    const eligibleInvitations = matchingInvitations.filter(
      (item) =>
        item.status === "invited" &&
        (!item.expiresAt || item.expiresAt > now)
    );

    const acceptedInvitations = matchingInvitations.filter(
      (item) => item.status === "accepted"
    );

    if (eligibleInvitations.length > 1) {
      throw new Error("AMBIGUOUS_ACTIVE_INVITATIONS");
    }

    let invitation;

    if (eligibleInvitations.length === 1) {
      invitation = eligibleInvitations[0];
    } else if (acceptedInvitations.length === 1) {
      invitation = acceptedInvitations[0];
    } else if (acceptedInvitations.length > 1) {
      throw new Error("AMBIGUOUS_ACCEPTED_INVITATIONS");
    } else if (matchingInvitations.length > 0) {
      for (const expired of matchingInvitations) {
        if (expired.status === "invited") {
          await ctx.db.patch(expired._id, {
            status: "expired",
            updatedAt: now,
          });
        }
      }

      await ctx.db.insert("webhookEvents", {
        eventId,
        eventType: args.eventType,
        processedAt: now,
        createdAt: now,
      });

      return {
        success: false,
        duplicate: false,
        status: "invitation_expired" as const,
      };
    } else {
      throw new Error("NO_MATCHING_ACTIVE_ERP_INVITATION");
    }

    // Idempotent acceptance for the same Clerk account.
    if (invitation.status === "accepted") {
      if (!invitation.acceptedUserId) {
        throw new Error("ACCEPTED_INVITATION_WITHOUT_USER");
      }

      const acceptedUser = await ctx.db.get(invitation.acceptedUserId);

      if (
        !acceptedUser ||
        acceptedUser.authSubject !== clerkUserId ||
        acceptedUser.email.toLowerCase() !== email
      ) {
        throw new Error("INVITATION_ALREADY_ACCEPTED_BY_ANOTHER_USER");
      }

      await ctx.db.insert("webhookEvents", {
        eventId,
        eventType: args.eventType,
        processedAt: now,
        createdAt: now,
      });

      return {
        success: true,
        duplicate: false,
        status: "already_accepted" as const,
        userId: acceptedUser._id,
      };
    }

    if (invitation.status !== "invited") {
      throw new Error("INVITATION_NOT_ACCEPTABLE");
    }

    if (invitation.expiresAt && invitation.expiresAt <= now) {
      await ctx.db.patch(invitation._id, {
        status: "expired",
        updatedAt: now,
      });

      await ctx.db.insert("webhookEvents", {
        eventId,
        eventType: args.eventType,
        processedAt: now,
        createdAt: now,
      });

      return {
        success: false,
        duplicate: false,
        status: "invitation_expired" as const,
      };
    }

    // Ensure this Clerk identity has not already been linked.
    const usersBySubject = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) =>
        q.eq("authSubject", clerkUserId)
      )
      .take(2);

    if (usersBySubject.length > 1) {
      throw new Error("DUPLICATE_CLERK_IDENTITY");
    }

    // A user record may already have been created by an earlier sign-in
    // synchronization before invitation provisioning completed. Reuse that
    // exact Clerk identity so a verified webhook retry can finish setup.
    const usersByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(2);

    if (usersByEmail.length > 1) {
      throw new Error("DUPLICATE_INVITATION_EMAIL_USERS");
    }

    let userId;
    if (usersBySubject.length === 1) {
      const existingUser = usersBySubject[0];
      if (existingUser.email.toLowerCase() !== email) {
        throw new Error("CLERK_IDENTITY_EMAIL_MISMATCH");
      }
      if (existingUser.status !== "active") {
        throw new Error("EXISTING_CLERK_USER_NOT_ACTIVE");
      }
      userId = existingUser._id;
    } else {
      if (usersByEmail.length > 0) {
        throw new Error("INVITATION_EMAIL_ALREADY_REGISTERED");
      }

      // Create the active user only after all checks pass.
      userId = await ctx.db.insert("users", {
        authSubject: clerkUserId,
        email,
        fullName: invitation.fullName,
        status: "active",
        createdAt: now,
        updatedAt: now,
        createdBy: "CLERK_WEBHOOK",
      });
    }

    // Apply the invitation's approved station-scoped role atomically with account activation.
    if (!invitation.roleId || !invitation.stationIds?.length) {
      throw new Error("INVITATION_ROLE_OR_STATIONS_MISSING");
    }
    const assignedRole = await ctx.db.get(invitation.roleId);
    if (!assignedRole || assignedRole.status !== "active" || assignedRole.scope !== "station" || assignedRole.code !== PRODUCTION_ROLE_CODE) {
      throw new Error("INVITATION_ROLE_INVALID");
    }
    const rolePermissionCodes = new Set<string>();
    const roleLinks = await ctx.db.query("rolePermissions")
      .withIndex("by_role", (q) => q.eq("roleId", assignedRole._id)).collect();
    for (const link of roleLinks) {
      const permission = await ctx.db.get(link.permissionId);
      if (permission) rolePermissionCodes.add(permission.code);
    }
    for (const [code] of PRODUCTION_PERMISSIONS) {
      if (!rolePermissionCodes.has(code)) throw new Error("INVITATION_ROLE_PERMISSION_MISSING");
    }
    const uniqueStationIds = [...new Set(invitation.stationIds)];
    if (uniqueStationIds.length !== invitation.stationIds.length) throw new Error("DUPLICATE_INVITATION_STATIONS");
    for (const stationId of uniqueStationIds) {
      const station = await ctx.db.get(stationId);
      if (!station || station.status !== "active") throw new Error("INVITATION_STATION_INACTIVE");
      const existingAssignment = await ctx.db.query("userStations")
        .withIndex("by_user_station", (q) => q.eq("userId", userId).eq("stationId", stationId))
        .first();
      if (!existingAssignment) {
        await ctx.db.insert("userStations", {
          userId,
          stationId,
          roleId: assignedRole._id,
          status: "active",
          assignedAt: now,
          assignedBy: "CLERK_WEBHOOK",
        });
      } else if (existingAssignment.roleId !== assignedRole._id || existingAssignment.status !== "active") {
        throw new Error("USER_STATION_ASSIGNMENT_CONFLICT");
      }
      await ctx.db.insert("auditLogs", {
        stationId,
        action: "user.station_role.assigned",
        entityType: "userStation",
        entityId: userId,
        operationId: `clerk-user-station-role-${eventId}-${stationId}`,
        details: {
          source: "CLERK_WEBHOOK",
          userId,
          roleCode: PRODUCTION_ROLE_CODE,
          stationId,
        },
        createdAt: now,
      });
    }

    // Link the accepted invitation to the new user.
    await ctx.db.patch(invitation._id, {
      status: "accepted",
      acceptedAt: now,
      acceptedUserId: userId,
      updatedAt: now,
      failureReason: undefined,
    });

    // Store the event ID for retry protection.
    await ctx.db.insert("webhookEvents", {
      eventId,
      eventType: args.eventType,
      processedAt: now,
      createdAt: now,
    });

    // System-originated audit record; no human actor is claimed.
    await ctx.db.insert("auditLogs", {
      action: "user.invitation.accepted",
      entityType: "invitation",
      entityId: invitation._id,
      operationId: `clerk-webhook-${eventId}`,
      details: {
        source: "CLERK_WEBHOOK",
        clerkUserId,
        email,
        userId,
        eventType: args.eventType,
      },
      createdAt: now,
    });

    return {
      success: true,
      duplicate: false,
      status: "accepted" as const,
      userId,
    };
  },
});
