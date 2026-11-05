
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  // 1. User Accounts
  users: defineTable({
    authSubject: v.string(),
    email: v.string(),
    fullName: v.string(),
    status: v.union(
      v.literal("invited"),
      v.literal("active"),
      v.literal("suspended")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.string()),
  })
    .index("by_authSubject", ["authSubject"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  // 2. Company Stations
  stations: defineTable({
    code: v.string(),
    name: v.string(),
    address: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("inactive")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),

  // 3. System Roles
  roles: defineTable({
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    scope: v.union(
      v.literal("central"),
      v.literal("station")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("inactive")
    ),
    isSystem: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_scope", ["scope"]),

  // 4. Permissions
  permissions: defineTable({
    code: v.string(),
    name: v.string(),
    module: v.string(),
    action: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_module", ["module"]),

  // 5. Role-Permission Relations
  rolePermissions: defineTable({
    roleId: v.id("roles"),
    permissionId: v.id("permissions"),
    assignedAt: v.number(),
  })
    .index("by_role", ["roleId"])
    .index("by_permission", ["permissionId"])
    .index("by_role_permission", ["roleId", "permissionId"]),

  // 6. User-Station Assignments
  userStations: defineTable({
    userId: v.id("users"),
    stationId: v.id("stations"),
    roleId: v.id("roles"),
    status: v.union(
      v.literal("active"),
      v.literal("inactive")
    ),
    assignedAt: v.number(),
    assignedBy: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_station", ["stationId"])
    .index("by_user_station", ["userId", "stationId"])
    .index("by_station_role", ["stationId", "roleId"]),

  // 7. Central Administration Roles
  centralUserRoles: defineTable({
    userId: v.id("users"),
    roleId: v.id("roles"),
    status: v.union(
      v.literal("active"),
      v.literal("inactive")
    ),
    assignedAt: v.number(),
    assignedBy: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_role", ["roleId"])
    .index("by_user_role", ["userId", "roleId"]),

  // 8. Application Audit Events
  auditLogs: defineTable({
    actorUserId: v.optional(v.id("users")),
    stationId: v.optional(v.id("stations")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.optional(v.string()),
    operationId: v.string(),
    details: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_actor", ["actorUserId"])
    .index("by_station", ["stationId"])
    .index("by_operation", ["operationId"])
    .index("by_createdAt", ["createdAt"]),
  // 9. User Invitations
  invitations: defineTable({
    email: v.string(),
    fullName: v.string(),

    status: v.union(
      v.literal("inviting"),
      v.literal("invited"),
      v.literal("accepted"),
      v.literal("expired"),
      v.literal("revoked"),
      v.literal("failed")
    ),

    clerkInvitationId: v.optional(v.string()),

    expiresAt: v.optional(v.number()),
    invitedAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),

    acceptedUserId: v.optional(v.id("users")),

    createdBy: v.id("users"),

    operationId: v.string(),

    failureReason: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_clerkInvitationId", ["clerkInvitationId"])
    .index("by_status", ["status"])
    .index("by_operationId", ["operationId"]),

  // 10. Clerk Webhook Event Tracking
  webhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    processedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventType", ["eventType"]),
});
