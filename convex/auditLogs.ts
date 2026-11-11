
import { query } from "./_generated/server";
import { requireCentralPermission } from "./lib/auth";

export const listRecentAuditLogs = query({
  args: {},
  handler: async (ctx) => {
    await requireCentralPermission(ctx, "audit.view");

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(100);

    const enrichedLogs = await Promise.all(
      logs.map(async (log) => {
        const [actor, station] = await Promise.all([
          log.actorUserId
            ? ctx.db.get(log.actorUserId)
            : Promise.resolve(null),

          log.stationId
            ? ctx.db.get(log.stationId)
            : Promise.resolve(null),
        ]);

        return {
          id: log._id,

          actorUserId: log.actorUserId,
          actorName: actor?.fullName ?? "غير معروف",
          actorEmail: actor?.email ?? "",

          stationId: log.stationId,
          stationName: station?.name ?? "غير محددة",
          stationCode: station?.code ?? "",

          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,

          operationId: log.operationId,
          details: log.details,
          createdAt: log.createdAt,
        };
      })
    );

    return enrichedLogs;
  },
});
