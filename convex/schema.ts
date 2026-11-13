
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


  // Employee-specific attendance method overrides. No row means fingerprint (default).
  attendancePolicies: defineTable({
    employeeId: v.id("employees"),
    method: v.union(v.literal("fingerprint"), v.literal("geofence"), v.literal("link")),
    enabled: v.boolean(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    radiusMeters: v.optional(v.number()),
    notes: v.optional(v.string()),
    assignedBy: v.id("users"),
    assignedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_employee", ["employeeId"])
    .index("by_method_enabled", ["method", "enabled"]),

  // Shift definitions and effective-dated employee assignments.
  shifts: defineTable({
    code: v.string(),
    name: v.string(),
    companyId: v.id("companies"),
    stationId: v.optional(v.id("stations")),
    startTime: v.string(),
    endTime: v.string(),
    breakMinutes: v.number(),
    graceMinutes: v.number(),
    weeklyDays: v.array(v.number()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_code", ["code"])
    .index("by_company", ["companyId"])
    .index("by_station", ["stationId"])
    .index("by_status", ["status"]),

  employeeShiftAssignments: defineTable({
    employeeId: v.id("employees"),
    shiftId: v.id("shifts"),
    effectiveFrom: v.string(),
    effectiveTo: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("ended")),
    assignedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_employee", ["employeeId"])
    .index("by_shift", ["shiftId"])
    .index("by_status", ["status"]),


  // Leave, absence and business mission requests. Balances are explicitly configured by HR.
  leaveBalances: defineTable({
    employeeId: v.id("employees"),
    year: v.number(),
    leaveType: v.union(v.literal("annual"), v.literal("sick"), v.literal("casual"), v.literal("unpaid")),
    allocatedDays: v.number(),
    adjustmentDays: v.number(),
    usedDays: v.number(),
    updatedAt: v.number(),
    updatedBy: v.id("users"),
  })
    .index("by_employee_year", ["employeeId", "year"])
    .index("by_year_type", ["year", "leaveType"]),

  leaveRequests: defineTable({
    employeeId: v.id("employees"),
    requestType: v.union(v.literal("annual"), v.literal("sick"), v.literal("casual"), v.literal("unpaid"), v.literal("mission")),
    startDate: v.string(),
    endDate: v.string(),
    days: v.number(),
    reason: v.string(),
    destination: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("cancelled")),
    reviewNote: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_employee", ["employeeId"])
    .index("by_status", ["status"])
    .index("by_startDate", ["startDate"]),


  // Approved disciplinary actions and rewards; amounts are only posted to payroll after approval.
  employeeActions: defineTable({
    employeeId: v.id("employees"),
    actionType: v.union(v.literal("sanction"), v.literal("reward")),
    category: v.string(),
    description: v.string(),
    effectiveDate: v.string(),
    amount: v.optional(v.number()),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("cancelled")),
    reviewNote: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_employee", ["employeeId"])
    .index("by_status", ["status"])
    .index("by_effectiveDate", ["effectiveDate"]),

  employeeLoans: defineTable({
    employeeId: v.id("employees"),
    loanType: v.union(v.literal("advance"), v.literal("loan")),
    requestedAmount: v.number(),
    approvedAmount: v.optional(v.number()),
    installmentsCount: v.number(),
    installmentAmount: v.optional(v.number()),
    firstInstallmentMonth: v.string(),
    reason: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("disbursed"), v.literal("rejected"), v.literal("closed")),
    paidAmount: v.number(),
    outstandingAmount: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    disbursedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_employee", ["employeeId"])
    .index("by_status", ["status"])
    .index("by_firstInstallmentMonth", ["firstInstallmentMonth"]),

  loanRepayments: defineTable({
    loanId: v.id("employeeLoans"),
    employeeId: v.id("employees"),
    amount: v.number(),
    repaymentDate: v.string(),
    method: v.string(),
    reference: v.optional(v.string()),
    recordedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_loan", ["loanId"])
    .index("by_employee", ["employeeId"])
    .index("by_repaymentDate", ["repaymentDate"]),

  compensationProfiles: defineTable({
    employeeId: v.id("employees"),
    currency: v.string(),
    basicSalary: v.number(),
    fixedAllowances: v.number(),
    fixedDeductions: v.number(),
    effectiveFrom: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    updatedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_employee", ["employeeId"])
    .index("by_status", ["status"]),

  payrollRuns: defineTable({
    periodStart: v.string(),
    periodEnd: v.string(),
    currency: v.string(),
    status: v.union(v.literal("draft"), v.literal("approved"), v.literal("closed")),
    employeeCount: v.number(),
    grossTotal: v.number(),
    deductionTotal: v.number(),
    netTotal: v.number(),
    createdBy: v.id("users"),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    closedBy: v.optional(v.id("users")),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_period", ["periodStart", "periodEnd"])
    .index("by_period_currency", ["periodStart", "periodEnd", "currency"])
    .index("by_status", ["status"]),

  payrollEntries: defineTable({
    payrollRunId: v.id("payrollRuns"),
    employeeId: v.id("employees"),
    currency: v.string(),
    basicSalary: v.number(),
    fixedAllowances: v.number(),
    overtimeAmount: v.number(),
    rewardsAmount: v.number(),
    otherEarnings: v.number(),
    fixedDeductions: v.number(),
    absenceDeductions: v.number(),
    sanctionsDeductions: v.number(),
    loanDeductions: v.number(),
    otherDeductions: v.number(),
    grossPay: v.number(),
    totalDeductions: v.number(),
    netPay: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run", ["payrollRunId"])
    .index("by_employee", ["employeeId"])
    .index("by_run_employee", ["payrollRunId", "employeeId"]),

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


  // Immutable source mirror for station production imports; kept separate from manually entered ERP records.
  stationProductionImports: defineTable({
    stationId: v.id("stations"),
    machineId: v.optional(v.string()),
    sourceRecordId: v.string(),
    sourceHash: v.string(),
    productionAt: v.number(),
    customerName: v.optional(v.string()),
    projectName: v.optional(v.string()),
    jobNo: v.optional(v.string()),
    concreteGrade: v.optional(v.string()),
    quantity: v.optional(v.number()),
    operatorName: v.optional(v.string()),
    importedAt: v.number(),
    sourceUpdatedAt: v.optional(v.number()),
  })
    .index("by_station_source", ["stationId", "sourceRecordId"])
    .index("by_station_machine_source", ["stationId", "machineId", "sourceRecordId"])
    .index("by_station_time", ["stationId", "productionAt"])
    .index("by_productionAt", ["productionAt"]),

  stationSyncBatches: defineTable({
    batchId: v.string(),
    stationId: v.id("stations"),
    machineId: v.optional(v.string()),
    received: v.number(),
    inserted: v.number(),
    updated: v.number(),
    processedAt: v.number(),
  })
    .index("by_batchId", ["batchId"])
    .index("by_station_processedAt", ["stationId", "processedAt"]),

  stationSyncState: defineTable({
    stationId: v.id("stations"),
    status: v.union(v.literal("online"), v.literal("error")),
    lastSeenAt: v.number(),
    lastSuccessAt: v.optional(v.number()),
    lastBatchId: v.optional(v.string()),
    recordsReceived: v.number(),
    recordsInserted: v.number(),
    recordsUpdated: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_station", ["stationId"]),

  // Only a hash is stored. Each station owns one active connector credential.
  stationConnectorCredentials: defineTable({
    stationId: v.id("stations"),
    tokenHash: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_station", ["stationId"])
    .index("by_tokenHash", ["tokenHash"]),

  // Operational equipment register. Maintenance is tracked separately from production.
  equipment: defineTable({
    assetCode: v.string(), name: v.string(), category: v.string(),
    stationId: v.optional(v.id("stations")), manufacturer: v.optional(v.string()),
    model: v.optional(v.string()), serialNumber: v.optional(v.string()),
    purchaseDate: v.optional(v.string()), meterUnit: v.optional(v.string()),
    currentMeter: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("maintenance"), v.literal("inactive"), v.literal("retired")),
    notes: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(), createdBy: v.id("users"),
  }).index("by_assetCode", ["assetCode"]).index("by_station", ["stationId"]).index("by_status", ["status"]),

  maintenanceOrders: defineTable({
    equipmentId: v.id("equipment"), stationId: v.optional(v.id("stations")), orderNo: v.string(),
    maintenanceType: v.union(v.literal("preventive"), v.literal("corrective"), v.literal("inspection")),
    priority: v.union(v.literal("low"), v.literal("normal"), v.literal("high"), v.literal("critical")),
    description: v.string(),
    status: v.union(v.literal("open"), v.literal("in_progress"), v.literal("completed"), v.literal("cancelled")),
    reportedAt: v.number(), scheduledAt: v.optional(v.number()), completedAt: v.optional(v.number()),
    downtimeMinutes: v.optional(v.number()), cost: v.optional(v.number()), meterReading: v.optional(v.number()),
    resolution: v.optional(v.string()), createdBy: v.id("users"), updatedBy: v.id("users"),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_equipment", ["equipmentId"]).index("by_equipment_status", ["equipmentId", "status"]).index("by_status", ["status"]).index("by_reportedAt", ["reportedAt"]).index("by_orderNo", ["orderNo"]),

  warehouses: defineTable({
    code: v.string(), name: v.string(), stationId: v.optional(v.id("stations")), location: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")), createdAt: v.number(), updatedAt: v.number(), createdBy: v.id("users"),
  }).index("by_code", ["code"]).index("by_station", ["stationId"]).index("by_status", ["status"]),

  inventoryItems: defineTable({
    itemCode: v.string(), name: v.string(), category: v.string(), unit: v.string(), minimumQuantity: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive")), notes: v.optional(v.string()),
    createdAt: v.number(), updatedAt: v.number(), createdBy: v.id("users"),
  }).index("by_itemCode", ["itemCode"]).index("by_category", ["category"]).index("by_status", ["status"]),

  inventoryBalances: defineTable({
    warehouseId: v.id("warehouses"), itemId: v.id("inventoryItems"), quantity: v.number(), updatedAt: v.number(),
  }).index("by_warehouse_item", ["warehouseId", "itemId"]).index("by_item", ["itemId"]).index("by_warehouse", ["warehouseId"]),

  stockMovements: defineTable({
    movementNo: v.string(), movementType: v.union(v.literal("receipt"), v.literal("issue"), v.literal("transfer"), v.literal("adjustment")),
    itemId: v.id("inventoryItems"), quantity: v.number(), fromWarehouseId: v.optional(v.id("warehouses")),
    toWarehouseId: v.optional(v.id("warehouses")), movementAt: v.number(), reference: v.optional(v.string()),
    notes: v.optional(v.string()), status: v.union(v.literal("posted"), v.literal("reversed")),
    createdBy: v.id("users"), createdAt: v.number(),
  }).index("by_movementNo", ["movementNo"]).index("by_item_time", ["itemId", "movementAt"])
    .index("by_fromWarehouse", ["fromWarehouseId"]).index("by_toWarehouse", ["toWarehouseId"]),

  // Explicit mappings only: raw station fields are never assigned a material meaning automatically.
  materialFieldMappings: defineTable({
    stationId: v.optional(v.id("stations")), sourceField: v.string(), itemId: v.id("inventoryItems"),
    unit: v.string(), active: v.boolean(), confirmedBy: v.id("users"), confirmedAt: v.number(), notes: v.optional(v.string()),
  }).index("by_station_field", ["stationId", "sourceField"]).index("by_item", ["itemId"]),

});
