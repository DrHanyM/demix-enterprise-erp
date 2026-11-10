
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

  // 11. HR Companies
  companies: defineTable({
    code: v.string(),
    name: v.string(),
    legalName: v.optional(v.string()),
    taxNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),

  // 12. HR Departments and hierarchical units
  departments: defineTable({
    code: v.string(),
    name: v.string(),
    companyId: v.id("companies"),
    stationId: v.optional(v.id("stations")),
    parentDepartmentId: v.optional(v.id("departments")),
    managerEmployeeId: v.optional(v.id("employees")),
    description: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_code", ["code"])
    .index("by_company", ["companyId"])
    .index("by_station", ["stationId"])
    .index("by_parent", ["parentDepartmentId"])
    .index("by_status", ["status"]),

  // 13. Job titles / positions
  jobTitles: defineTable({
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    departmentId: v.optional(v.id("departments")),
    grade: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_code", ["code"])
    .index("by_department", ["departmentId"])
    .index("by_status", ["status"]),

  // 14. Employee master records
  employees: defineTable({
    employeeNo: v.string(),
    fullName: v.string(),
    nationalId: v.optional(v.string()),
    email: v.optional(v.string()),
    mobile: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"))),
    companyId: v.id("companies"),
    stationId: v.optional(v.id("stations")),
    departmentId: v.id("departments"),
    jobTitleId: v.id("jobTitles"),
    managerEmployeeId: v.optional(v.id("employees")),
    employmentType: v.union(
      v.literal("permanent"),
      v.literal("contract"),
      v.literal("temporary"),
      v.literal("daily")
    ),
    hireDate: v.string(),
    endDate: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("on_leave"),
      v.literal("terminated")
    ),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_employeeNo", ["employeeNo"])
    .index("by_nationalId", ["nationalId"])
    .index("by_email", ["email"])
    .index("by_company", ["companyId"])
    .index("by_station", ["stationId"])
    .index("by_department", ["departmentId"])
    .index("by_jobTitle", ["jobTitleId"])
    .index("by_status", ["status"]),

  // 10. Clerk Webhook Event Tracking
  webhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    processedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventType", ["eventType"]),

  // Production records are separate from the original Access Search.MDB source.
  // This table stores only records explicitly entered through the ERP UI.
  productionRecords: defineTable({
    stationId: v.id("stations"),
    productionAt: v.number(),
    customerName: v.string(),
    projectName: v.string(),
    jobNo: v.string(),
    concreteGrade: v.string(),
    quantity: v.number(),
    operatorName: v.string(),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_station_time", ["stationId", "productionAt"])
    .index("by_station_job", ["stationId", "jobNo"]),

});