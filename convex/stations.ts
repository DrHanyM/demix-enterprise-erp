
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCentralPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

const STATION_ACTION = "station.create";
const STATION_ENTITY = "station";

// 1. Create a new station securely.
export const createStation = mutation({
  args: {
    name: v.string(),
    operationId: v.string(),
  },

  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(
      ctx,
      "system.stations.manage"
    );

    const name = args.name.trim();
    const operationId = args.operationId.trim();

    if (!name || name.length > 100) {
      throw new Error(
        "INVALID_STATION_NAME: اسم المحطة مطلوب وبحد أقصى 100 حرف."
      );
    }

    if (!operationId || operationId.length > 200) {
      throw new Error(
        "INVALID_OPERATION_ID: رقم العملية غير صالح."
      );
    }

    // Check whether this operation was already completed.
    const previousLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_operation", (q) =>
        q.eq("operationId", operationId)
      )
      .take(2);

    if (previousLogs.length > 1) {
      throw new Error(
        "DUPLICATE_OPERATION_ID: رقم العملية مكرر."
      );
    }

    if (previousLogs.length === 1) {
      const previous = previousLogs[0];

      if (
        previous.actorUserId !== user._id ||
        previous.action !== STATION_ACTION ||
        previous.entityType !== STATION_ENTITY ||
        !previous.entityId
      ) {
        throw new Error(
          "OPERATION_ID_CONFLICT: رقم العملية مستخدم لعملية أخرى."
        );
      }

      const previousStation = await ctx.db.get(
        previous.entityId as Id<"stations">
      );

      if (
        !previousStation ||
        previous.stationId !== previousStation._id
      ) {
        throw new Error(
          "AUDIT_REFERENCE_ERROR: تعذر التحقق من المحطة المسجلة."
        );
      }

      return {
        success: true,
        created: false,
        station: previousStation,
        message: "هذه العملية نُفذت سابقًا ولم يتم إنشاء محطة مكررة.",
      };
    }

    // Prevent duplicate station names.
    const existingStations = await ctx.db
      .query("stations")
      .collect();

    const normalizedName = name.toLocaleLowerCase();

    const duplicateName = existingStations.some(
      (station) =>
        station.name.trim().toLocaleLowerCase() === normalizedName
    );

    if (duplicateName) {
      throw new Error(
        "DUPLICATE_STATION_NAME: اسم المحطة مسجل بالفعل."
      );
    }

    // Generate the next station code automatically.
    let highestNumber = 0;

    for (const station of existingStations) {
      const match = /^ST-(\d+)$/.exec(station.code);

      if (match) {
        highestNumber = Math.max(
          highestNumber,
          Number(match[1])
        );
      }
    }

    const code = `ST-${String(highestNumber + 1).padStart(3, "0")}`;

    const duplicateCode = await ctx.db
      .query("stations")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (duplicateCode) {
      throw new Error(
        "DUPLICATE_STATION_CODE: كود المحطة مستخدم بالفعل."
      );
    }

    const now = Date.now();

    // Create station.
    const stationId = await ctx.db.insert("stations", {
      code,
      name,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Append audit log in the same Convex transaction.
    await appendAuditLog(ctx, {
      stationId,
      action: STATION_ACTION,
      entityType: STATION_ENTITY,
      entityId: stationId,
      operationId,
      details: {
        stationCode: code,
        stationName: name,
        status: "active",
      },
    });

    return {
      success: true,
      created: true,
      station: {
        _id: stationId,
        code,
        name,
        status: "active" as const,
      },
      message: "تم إنشاء المحطة وتسجيل العملية بنجاح.",
    };
  },
});

// One-click, idempotent initialization of the six approved company stations.
export const initializeCompanyStations = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCentralPermission(ctx, "system.stations.manage");

    const approvedNames = [
      "أبو رواش",
      "أبو قير",
      "القطامية",
      "الكوامل",
      "ABC",
      "رأس الحكمة",
    ];

    const existingStations = await ctx.db.query("stations").collect();
    const normalized = (value: string) => value.trim().toLocaleLowerCase();
    let highestNumber = 0;
    for (const station of existingStations) {
      const match = /^ST-(\\d+)$/.exec(station.code);
      if (match) highestNumber = Math.max(highestNumber, Number(match[1]));
    }

    const results: Array<{ name: string; code?: string; created: boolean }> = [];
    for (const name of approvedNames) {
      const existing = existingStations.find(
        (station) => normalized(station.name) === normalized(name)
      );
      if (existing) {
        results.push({ name, code: existing.code, created: false });
        continue;
      }

      highestNumber += 1;
      const code = `ST-${String(highestNumber).padStart(3, "0")}`;
      const stationId = await ctx.db.insert("stations", {
        code,
        name,
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await appendAuditLog(ctx, {
        stationId,
        action: STATION_ACTION,
        entityType: STATION_ENTITY,
        entityId: stationId,
        operationId: `company-stations-initialization-v1-${code}`,
        details: {
          stationCode: code,
          stationName: name,
          status: "active",
          source: "COMPANY_STATIONS_INITIALIZATION",
        },
      });
      results.push({ name, code, created: true });
    }

    return {
      success: true,
      createdCount: results.filter((item) => item.created).length,
      existingCount: results.filter((item) => !item.created).length,
      stations: results,
    };
  },
});

// 2. List stations for authorized central administrators.
export const listStations = query({
  args: {},

  handler: async (ctx) => {
    await requireCentralPermission(
      ctx,
      "system.stations.manage"
    );

    const stations = await ctx.db
      .query("stations")
      .collect();

    return stations.sort((a, b) =>
      a.name.localeCompare(b.name, "ar")
    );
  },
});

// 3. Update station name.
export const updateStation = mutation({
  args: {
    stationId: v.id("stations"),
    name: v.string(),
    operationId: v.string(),
  },

  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(
      ctx,
      "system.stations.manage"
    );

    const name = args.name.trim();
    const operationId = args.operationId.trim();

    if (!name || name.length > 100) {
      throw new Error("INVALID_STATION_NAME: اسم المحطة غير صالح.");
    }

    if (!operationId || operationId.length > 200) {
      throw new Error("INVALID_OPERATION_ID: رقم العملية غير صالح.");
    }

    const existingLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_operation", (q) =>
        q.eq("operationId", operationId)
      )
      .take(2);

    if (existingLogs.length > 1) {
      throw new Error("DUPLICATE_OPERATION_ID");
    }

    if (existingLogs.length === 1) {
      const log = existingLogs[0];

      if (
        log.actorUserId !== user._id ||
        log.action !== "station.update" ||
        log.entityType !== "station" ||
        log.entityId !== args.stationId ||
        log.details?.newName !== name
      ) {
        throw new Error("OPERATION_ID_CONFLICT");
      }

      return {
        success: true,
        updated: false,
        message: "تم تنفيذ هذا التعديل سابقًا.",
      };
    }

    const station = await ctx.db.get(args.stationId);

    if (!station) {
      throw new Error("STATION_NOT_FOUND");
    }

    const allStations = await ctx.db.query("stations").collect();

    const duplicate = allStations.some(
      (item) =>
        item._id !== args.stationId &&
        item.name.trim().toLocaleLowerCase() ===
          name.toLocaleLowerCase()
    );

    if (duplicate) {
      throw new Error("DUPLICATE_STATION_NAME");
    }

    await ctx.db.patch(args.stationId, {
      name,
      updatedAt: Date.now(),
    });

    await appendAuditLog(ctx, {
      stationId: args.stationId,
      action: "station.update",
      entityType: "station",
      entityId: args.stationId,
      operationId,
      details: {
        oldName: station.name,
        newName: name,
      },
    });

    return {
      success: true,
      updated: true,
      message: "تم تعديل اسم المحطة بنجاح.",
    };
  },
});

// 4. Activate or deactivate a station.
export const setStationStatus = mutation({
  args: {
    stationId: v.id("stations"),
    status: v.union(
      v.literal("active"),
      v.literal("inactive")
    ),
    operationId: v.string(),
  },

  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(
      ctx,
      "system.stations.manage"
    );

    const operationId = args.operationId.trim();

    if (!operationId || operationId.length > 200) {
      throw new Error("INVALID_OPERATION_ID");
    }

    const existingLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_operation", (q) =>
        q.eq("operationId", operationId)
      )
      .take(2);

    if (existingLogs.length > 1) {
      throw new Error("DUPLICATE_OPERATION_ID");
    }

    if (existingLogs.length === 1) {
      const log = existingLogs[0];

      if (
        log.actorUserId !== user._id ||
        log.action !== "station.status_change" ||
        log.entityType !== "station" ||
        log.entityId !== args.stationId ||
        log.details?.newStatus !== args.status
      ) {
        throw new Error("OPERATION_ID_CONFLICT");
      }

      return {
        success: true,
        changed: false,
        message: "تم تنفيذ تغيير الحالة سابقًا.",
      };
    }

    const station = await ctx.db.get(args.stationId);

    if (!station) {
      throw new Error("STATION_NOT_FOUND");
    }

    if (station.status === args.status) {
      return {
        success: true,
        changed: false,
        message: "المحطة بالفعل بالحالة المطلوبة.",
      };
    }

    await ctx.db.patch(args.stationId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    await appendAuditLog(ctx, {
      stationId: args.stationId,
      action: "station.status_change",
      entityType: "station",
      entityId: args.stationId,
      operationId,
      details: {
        oldStatus: station.status,
        newStatus: args.status,
      },
    });

    return {
      success: true,
      changed: true,
      message:
        args.status === "active"
          ? "تم تفعيل المحطة بنجاح."
          : "تم تعطيل المحطة بنجاح.",
    };
  },
});
