
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

type AuditInput = {
  stationId?: Id<"stations">;
  action: string;
  entityType: string;
  entityId?: string;
  operationId: string;
  details?: Record<string, unknown>;
};

export async function appendAuditLog(
  ctx: MutationCtx,
  input: AuditInput
): Promise<{
  created: boolean;
  auditLogId: Id<"auditLogs">;
}> {
  // 1. Verify authenticated identity
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("UNAUTHENTICATED: تسجيل الدخول مطلوب.");
  }

  // 2. Derive actor from the authenticated identity.
  // Never accept actorUserId from the caller.
  const users = await ctx.db
    .query("users")
    .withIndex("by_authSubject", (q) =>
      q.eq("authSubject", identity.subject)
    )
    .take(2);

  if (users.length !== 1) {
    throw new Error("USER_NOT_FOUND: تعذر تحديد المستخدم المنفذ.");
  }

  const actor = users[0];

  if (actor.status !== "active") {
    throw new Error("USER_INACTIVE: حساب المستخدم غير نشط.");
  }

  // 3. Validate required audit fields
  if (
    !input.action.trim() ||
    !input.entityType.trim() ||
    !input.operationId.trim()
  ) {
    throw new Error("INVALID_AUDIT_DATA: بيانات سجل التدقيق غير مكتملة.");
  }

  if (input.operationId.length > 200) {
    throw new Error("INVALID_OPERATION_ID: رقم العملية طويل جدًا.");
  }

  // 4. Check optional station reference
  if (input.stationId) {
    const station = await ctx.db.get(input.stationId);

    if (!station) {
      throw new Error("STATION_NOT_FOUND: المحطة غير موجودة.");
    }
  }

  // 5. Enforce operation idempotency
  const existingLogs = await ctx.db
    .query("auditLogs")
    .withIndex("by_operation", (q) =>
      q.eq("operationId", input.operationId)
    )
    .take(2);

  if (existingLogs.length > 1) {
    throw new Error(
      "DUPLICATE_OPERATION_ID: رقم العملية مستخدم في أكثر من سجل."
    );
  }

  if (existingLogs.length === 1) {
    const existing = existingLogs[0];

    const sameOperation =
      existing.actorUserId === actor._id &&
      existing.stationId === input.stationId &&
      existing.action === input.action &&
      existing.entityType === input.entityType &&
      existing.entityId === input.entityId;

    if (!sameOperation) {
      throw new Error(
        "OPERATION_ID_CONFLICT: رقم العملية مرتبط بعملية مختلفة."
      );
    }

    return {
      created: false,
      auditLogId: existing._id,
    };
  }

  // 6. Append a new audit record
  const auditLogId = await ctx.db.insert("auditLogs", {
    actorUserId: actor._id,
    stationId: input.stationId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    operationId: input.operationId,
    details: input.details,
    createdAt: Date.now(),
  });

  return {
    created: true,
    auditLogId,
  };
}
