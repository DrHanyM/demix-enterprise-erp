import { mutation } from "./_generated/server";
import { requireCentralPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

const HR_PERMISSIONS = [
  {
    code: "hr.structure.manage",
    name: "إدارة الهيكل التنظيمي",
    module: "hr.structure",
    action: "manage",
    description: "إدارة الشركات والإدارات والأقسام والوظائف والمسميات الوظيفية.",
  },
  {
    code: "hr.attendance.manage",
    name: "إدارة الحضور ووسائل إثباته",
    module: "hr.attendance",
    action: "manage",
    description: "تخصيص وسيلة الحضور للموظفين وإدارة إعداداتها.",
  },
  {
    code: "hr.employees.manage",
    name: "إدارة ملفات الموظفين",
    module: "hr.employees",
    action: "manage",
    description: "إنشاء وعرض وتحديث ملفات الموظفين وبياناتهم الوظيفية.",
  },
] as const;

/**
 * Run once after deploying the HR foundation.
 * This only registers missing HR permission definitions. It does not assign
 * permissions to any user or role and does not alter existing assignments.
 */
export const registerHrPermissions = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireCentralPermission(ctx, "system.permissions.manage");
    const now = Date.now();
    const created: string[] = [];
    const existing: string[] = [];

    for (const permission of HR_PERMISSIONS) {
      const matches = await ctx.db.query("permissions")
        .withIndex("by_code", q => q.eq("code", permission.code))
        .take(2);

      if (matches.length > 1) {
        throw new Error(`DUPLICATE_PERMISSION_DEFINITION: ${permission.code}`);
      }

      if (matches.length === 1) {
        existing.push(permission.code);
        continue;
      }

      await ctx.db.insert("permissions", { ...permission, createdAt: now });
      created.push(permission.code);
    }

    await appendAuditLog(ctx, {
      action: "hr.permissions.register",
      entityType: "hr_permission_catalog",
      entityId: "hr-core",
      operationId: `hr-permissions-register-${user._id}`,
      details: { created, existing },
    });

    return { success: true, created, existing };
  },
});
