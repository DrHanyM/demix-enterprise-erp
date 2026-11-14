import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { requireCentralPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

const op = (value: string) => {
  if (value.trim().length < 10 || value.length > 200) throw new Error("INVALID_OPERATION_ID");
};
const textField = (value: string, code: string, max = 160) => {
  const clean = value.trim();
  if (!clean || clean.length > max) throw new Error(code);
  return clean;
};
const uniqueBy = async (ctx: any, table: string, index: string, field: string, value: string) => {
  const rows = await ctx.db.query(table).withIndex(index, (q: any) => q.eq(field, value)).take(2);
  if (rows.length > 1) throw new Error("DUPLICATE_MASTER_CODE");
  return rows[0] ?? null;
};

export const registerOperationsPermissions = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireCentralPermission(ctx, "system.permissions.manage");
    const catalog = [
      ["equipment.view", "عرض المعدات والصيانة", "equipment", "view"],
      ["equipment.manage", "إدارة المعدات والصيانة", "equipment", "manage"],
      ["inventory.view", "عرض المخازن والمخزون", "inventory", "view"],
      ["inventory.manage", "إدارة المخازن وحركات المخزون", "inventory", "manage"],
      ["operations.reports.view", "عرض تقارير التشغيل الموحدة", "operations.reports", "view"],
    ] as const;
    const created: string[] = [];
    const existing: string[] = [];
    for (const [code, name, module, action] of catalog) {
      const rows = await ctx.db.query("permissions").withIndex("by_code", q => q.eq("code", code)).take(2);
      if (rows.length > 1) throw new Error("DUPLICATE_PERMISSION_DEFINITION: " + code);
      if (rows.length) { existing.push(code); continue; }
      await ctx.db.insert("permissions", { code, name, module, action, createdAt: Date.now() });
      created.push(code);
    }
    await appendAuditLog(ctx, {
      action: "operations.permissions.register", entityType: "permission_catalog",
      entityId: "operations-v1", operationId: "operations-permissions-register-" + user._id,
      details: { created, existing, note: "Definitions only; no role assignments changed." },
    });
    return { success: true, created, existing };
  },
});

export const listEquipment = query({
  args: { stationId: v.optional(v.id("stations")), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "equipment.view");
    const rows = await ctx.db.query("equipment").collect();
    return rows.filter(x => (!args.stationId || x.stationId === args.stationId) && (!args.status || x.status === args.status))
      .sort((a,b) => a.assetCode.localeCompare(b.assetCode));
  },
});

export const createEquipment = mutation({
  args: {
    assetCode: v.string(), name: v.string(), category: v.string(), stationId: v.optional(v.id("stations")),
    manufacturer: v.optional(v.string()), model: v.optional(v.string()), serialNumber: v.optional(v.string()),
    purchaseDate: v.optional(v.string()), meterUnit: v.optional(v.string()), currentMeter: v.optional(v.number()),
    notes: v.optional(v.string()), operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "equipment.manage"); op(args.operationId);
    const assetCode = textField(args.assetCode, "INVALID_ASSET_CODE", 60);
    const name = textField(args.name, "INVALID_EQUIPMENT_NAME");
    const category = textField(args.category, "INVALID_EQUIPMENT_CATEGORY", 80);
    if (args.currentMeter !== undefined && (!Number.isFinite(args.currentMeter) || args.currentMeter < 0)) throw new Error("INVALID_METER_READING");
    if (await uniqueBy(ctx, "equipment", "by_assetCode", "assetCode", assetCode)) throw new Error("DUPLICATE_ASSET_CODE");
    if (args.stationId) { const station = await ctx.db.get(args.stationId); if (!station || station.status !== "active") throw new Error("STATION_NOT_ACTIVE"); }
    const now = Date.now();
    const id = await ctx.db.insert("equipment", {
      assetCode, name, category, stationId: args.stationId, manufacturer: args.manufacturer?.trim(),
      model: args.model?.trim(), serialNumber: args.serialNumber?.trim(), purchaseDate: args.purchaseDate,
      meterUnit: args.meterUnit?.trim(), currentMeter: args.currentMeter, notes: args.notes?.trim(),
      status: "active", createdAt: now, updatedAt: now, createdBy: user._id,
    });
    await appendAuditLog(ctx, { stationId: args.stationId, action: "equipment.create", entityType: "equipment", entityId: id, operationId: args.operationId, details: { assetCode, name, category } });
    return { success: true, id };
  },
});

export const createMaintenanceOrder = mutation({
  args: {
    equipmentId: v.id("equipment"),
    orderNo: v.string(),
    maintenanceType: v.union(v.literal("preventive"), v.literal("corrective"), v.literal("inspection")),
    priority: v.union(v.literal("low"), v.literal("normal"), v.literal("high"), v.literal("critical")),
    description: v.string(), scheduledAt: v.optional(v.number()), meterReading: v.optional(v.number()),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "equipment.manage"); op(args.operationId);
    const equipment = await ctx.db.get(args.equipmentId); if (!equipment) throw new Error("EQUIPMENT_NOT_FOUND");
    if (equipment.status === "inactive" || equipment.status === "retired") throw new Error("EQUIPMENT_NOT_AVAILABLE_FOR_MAINTENANCE");
    const orderNo = textField(args.orderNo, "INVALID_MAINTENANCE_ORDER_NO", 60);
    const description = textField(args.description, "INVALID_MAINTENANCE_DESCRIPTION", 2000);
    if (await uniqueBy(ctx, "maintenanceOrders", "by_orderNo", "orderNo", orderNo)) throw new Error("DUPLICATE_MAINTENANCE_ORDER");
    if (args.meterReading !== undefined && (!Number.isFinite(args.meterReading) || args.meterReading < 0)) throw new Error("INVALID_METER_READING");
    const now = Date.now();
    const id = await ctx.db.insert("maintenanceOrders", {
      equipmentId: equipment._id, stationId: equipment.stationId, orderNo, maintenanceType: args.maintenanceType,
      priority: args.priority, description, status: "open", reportedAt: now, scheduledAt: args.scheduledAt,
      meterReading: args.meterReading, createdBy: user._id, updatedBy: user._id, createdAt: now, updatedAt: now,
    });
    await ctx.db.patch(equipment._id, { status: "maintenance", updatedAt: now });
    await appendAuditLog(ctx, { stationId: equipment.stationId, action: "equipment.maintenance.open", entityType: "maintenanceOrder", entityId: id, operationId: args.operationId, details: { orderNo, assetCode: equipment.assetCode, priority: args.priority } });
    return { success: true, id };
  },
});

export const listMaintenanceOrders = query({
  args: { status: v.optional(v.string()), equipmentId: v.optional(v.id("equipment")) },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "equipment.view");
    const rows = await ctx.db.query("maintenanceOrders").collect();
    return rows.filter(x => (!args.status || x.status === args.status) && (!args.equipmentId || x.equipmentId === args.equipmentId))
      .sort((a,b) => b.reportedAt - a.reportedAt);
  },
});

export const completeMaintenanceOrder = mutation({
  args: { orderId: v.id("maintenanceOrders"), resolution: v.string(), downtimeMinutes: v.number(), cost: v.optional(v.number()), operationId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "equipment.manage"); op(args.operationId);
    const order = await ctx.db.get(args.orderId); if (!order || (order.status !== "open" && order.status !== "in_progress")) throw new Error("MAINTENANCE_ORDER_NOT_OPEN");
    const resolution = textField(args.resolution, "INVALID_MAINTENANCE_RESOLUTION", 2000);
    if (!Number.isInteger(args.downtimeMinutes) || args.downtimeMinutes < 0 || args.downtimeMinutes > 525600) throw new Error("INVALID_DOWNTIME");
    if (args.cost !== undefined && (!Number.isFinite(args.cost) || args.cost < 0)) throw new Error("INVALID_MAINTENANCE_COST");
    const now = Date.now();
    await ctx.db.patch(order._id, { status: "completed", resolution, downtimeMinutes: args.downtimeMinutes, cost: args.cost, completedAt: now, updatedBy: user._id, updatedAt: now });
    const equipment = await ctx.db.get(order.equipmentId);
    if (equipment && equipment.status === "maintenance") {
      const [otherOpen, otherInProgress] = await Promise.all([
        ctx.db.query("maintenanceOrders")
          .withIndex("by_equipment_status", q => q.eq("equipmentId", equipment._id).eq("status", "open"))
          .take(2),
        ctx.db.query("maintenanceOrders")
          .withIndex("by_equipment_status", q => q.eq("equipmentId", equipment._id).eq("status", "in_progress"))
          .take(2),
      ]);
      const hasOtherActiveOrder = [...otherOpen, ...otherInProgress].some(x => x._id !== order._id);
      if (!hasOtherActiveOrder) await ctx.db.patch(equipment._id, { status: "active", updatedAt: now });
    }
    await appendAuditLog(ctx, { stationId: order.stationId, action: "equipment.maintenance.complete", entityType: "maintenanceOrder", entityId: order._id, operationId: args.operationId, details: { downtimeMinutes: args.downtimeMinutes, cost: args.cost } });
    return { success: true };
  },
});

export const listWarehousesAndItems = query({
  args: {},
  handler: async (ctx) => {
    await requireCentralPermission(ctx, "inventory.view");
    const [warehouses, items, balances, movements] = await Promise.all([
      ctx.db.query("warehouses").collect(), ctx.db.query("inventoryItems").collect(),
      ctx.db.query("inventoryBalances").collect(), ctx.db.query("stockMovements").order("desc").take(100),
    ]);
    return { warehouses: warehouses.sort((a,b)=>a.code.localeCompare(b.code)), items: items.sort((a,b)=>a.itemCode.localeCompare(b.itemCode)), balances, movements };
  },
});

export const createWarehouse = mutation({
  args: { code: v.string(), name: v.string(), stationId: v.optional(v.id("stations")), location: v.optional(v.string()), operationId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "inventory.manage"); op(args.operationId);
    const code = textField(args.code, "INVALID_WAREHOUSE_CODE", 60), name = textField(args.name, "INVALID_WAREHOUSE_NAME");
    if (await uniqueBy(ctx, "warehouses", "by_code", "code", code)) throw new Error("DUPLICATE_WAREHOUSE_CODE");
    if (args.stationId) { const station = await ctx.db.get(args.stationId); if (!station || station.status !== "active") throw new Error("STATION_NOT_ACTIVE"); }
    const now = Date.now(), id = await ctx.db.insert("warehouses", { code, name, stationId: args.stationId, location: args.location?.trim(), status: "active", createdAt: now, updatedAt: now, createdBy: user._id });
    await appendAuditLog(ctx, { stationId: args.stationId, action: "inventory.warehouse.create", entityType: "warehouse", entityId: id, operationId: args.operationId, details: { code, name } });
    return { success: true, id };
  },
});

export const createInventoryItem = mutation({
  args: { itemCode: v.string(), name: v.string(), category: v.string(), unit: v.string(), minimumQuantity: v.number(), notes: v.optional(v.string()), operationId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "inventory.manage"); op(args.operationId);
    const itemCode = textField(args.itemCode, "INVALID_ITEM_CODE", 60), name = textField(args.name, "INVALID_ITEM_NAME");
    const category = textField(args.category, "INVALID_ITEM_CATEGORY", 80), unit = textField(args.unit, "INVALID_ITEM_UNIT", 30);
    if (!Number.isFinite(args.minimumQuantity) || args.minimumQuantity < 0) throw new Error("INVALID_MINIMUM_QUANTITY");
    if (await uniqueBy(ctx, "inventoryItems", "by_itemCode", "itemCode", itemCode)) throw new Error("DUPLICATE_ITEM_CODE");
    const now = Date.now(), id = await ctx.db.insert("inventoryItems", { itemCode, name, category, unit, minimumQuantity: args.minimumQuantity, notes: args.notes?.trim(), status: "active", createdAt: now, updatedAt: now, createdBy: user._id });
    await appendAuditLog(ctx, { action: "inventory.item.create", entityType: "inventoryItem", entityId: id, operationId: args.operationId, details: { itemCode, name, unit } });
    return { success: true, id };
  },
});

export const postStockMovement = mutation({
  args: {
    movementNo: v.string(), movementType: v.union(v.literal("receipt"), v.literal("issue"), v.literal("transfer")),
    itemId: v.id("inventoryItems"), quantity: v.number(), fromWarehouseId: v.optional(v.id("warehouses")),
    toWarehouseId: v.optional(v.id("warehouses")), movementAt: v.number(), reference: v.optional(v.string()),
    notes: v.optional(v.string()), operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "inventory.manage"); op(args.operationId);
    const movementNo = textField(args.movementNo, "INVALID_MOVEMENT_NO", 60);
    if (!Number.isFinite(args.quantity) || args.quantity <= 0 || args.quantity > 100000000) throw new Error("INVALID_MOVEMENT_QUANTITY");
    if (!Number.isFinite(args.movementAt) || args.movementAt <= 0) throw new Error("INVALID_MOVEMENT_DATE");
    if (await uniqueBy(ctx, "stockMovements", "by_movementNo", "movementNo", movementNo)) throw new Error("DUPLICATE_MOVEMENT_NO");
    const item = await ctx.db.get(args.itemId); if (!item || item.status !== "active") throw new Error("INVENTORY_ITEM_NOT_ACTIVE");
    const from = args.fromWarehouseId ? await ctx.db.get(args.fromWarehouseId) : null;
    const to = args.toWarehouseId ? await ctx.db.get(args.toWarehouseId) : null;
    if (args.movementType === "receipt" && (!to || from)) throw new Error("RECEIPT_REQUIRES_DESTINATION_ONLY");
    if (args.movementType === "issue" && (!from || to)) throw new Error("ISSUE_REQUIRES_SOURCE_ONLY");
    if (args.movementType === "transfer" && (!from || !to || from._id === to._id)) throw new Error("TRANSFER_REQUIRES_TWO_DIFFERENT_WAREHOUSES");
    if ((from && from.status !== "active") || (to && to.status !== "active")) throw new Error("WAREHOUSE_NOT_ACTIVE");
    const now = Date.now();
    const getBalance = async (warehouseId: any) => {
      const rows = await ctx.db.query("inventoryBalances").withIndex("by_warehouse_item", q => q.eq("warehouseId", warehouseId).eq("itemId", item._id)).take(2);
      if (rows.length > 1) throw new Error("DUPLICATE_INVENTORY_BALANCE");
      return rows[0] ?? null;
    };
    const fromBalance = from ? await getBalance(from._id) : null;
    if (from && (!fromBalance || fromBalance.quantity < args.quantity)) throw new Error("INSUFFICIENT_STOCK");
    const toBalance = to ? await getBalance(to._id) : null;
    if (fromBalance) await ctx.db.patch(fromBalance._id, { quantity: Math.round((fromBalance.quantity - args.quantity) * 10000) / 10000, updatedAt: now });
    if (to) {
      if (toBalance) await ctx.db.patch(toBalance._id, { quantity: Math.round((toBalance.quantity + args.quantity) * 10000) / 10000, updatedAt: now });
      else await ctx.db.insert("inventoryBalances", { warehouseId: to._id, itemId: item._id, quantity: args.quantity, updatedAt: now });
    }
    const id = await ctx.db.insert("stockMovements", {
      movementNo, movementType: args.movementType, itemId: item._id, quantity: args.quantity,
      fromWarehouseId: from?._id, toWarehouseId: to?._id, movementAt: args.movementAt,
      reference: args.reference?.trim(), notes: args.notes?.trim(), status: "posted", createdBy: user._id, createdAt: now,
    });
    await appendAuditLog(ctx, { action: "inventory.stock." + args.movementType, entityType: "stockMovement", entityId: id, operationId: args.operationId, details: { movementNo, itemCode: item.itemCode, quantity: args.quantity, fromWarehouse: from?.code, toWarehouse: to?.code } });
    return { success: true, id };
  },
});

export const listOperationsOverview = query({
  args: { fromAt: v.optional(v.number()), toAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "operations.reports.view");
    const fromAt = args.fromAt ?? 0, toAt = args.toAt ?? Date.now();
    if (fromAt > toAt) throw new Error("INVALID_REPORT_RANGE");
    const [imports, manual, activeEquipment, maintenanceEquipment, inactiveEquipment, retiredEquipment,
      openOrders, inProgressOrders, completedOrders, items, balances, stations] = await Promise.all([
      ctx.db.query("stationProductionImports").withIndex("by_productionAt", q => q.gte("productionAt", fromAt).lte("productionAt", toAt)).collect(),
      ctx.db.query("productionRecords").withIndex("by_productionAt", q => q.gte("productionAt", fromAt).lte("productionAt", toAt)).collect(),
      ctx.db.query("equipment").withIndex("by_status", q => q.eq("status", "active")).collect(),
      ctx.db.query("equipment").withIndex("by_status", q => q.eq("status", "maintenance")).collect(),
      ctx.db.query("equipment").withIndex("by_status", q => q.eq("status", "inactive")).collect(),
      ctx.db.query("equipment").withIndex("by_status", q => q.eq("status", "retired")).collect(),
      ctx.db.query("maintenanceOrders").withIndex("by_status", q => q.eq("status", "open")).collect(),
      ctx.db.query("maintenanceOrders").withIndex("by_status", q => q.eq("status", "in_progress")).collect(),
      ctx.db.query("maintenanceOrders").withIndex("by_completedAt", q => q.gte("completedAt", fromAt).lte("completedAt", toAt)).collect(),
      ctx.db.query("inventoryItems").collect(),
      ctx.db.query("inventoryBalances").collect(),
      ctx.db.query("stations").withIndex("by_status", q => q.eq("status", "active")).collect(),
    ]);
    return {
      period: { fromAt, toAt },
      production: {
        importedRecords: imports.length, importedQuantity: imports.reduce((s,x)=>s+(x.quantity ?? 0),0),
        manualRecords: manual.length, manualQuantity: manual.reduce((s,x)=>s+x.quantity,0),
      },
      equipment: { total: activeEquipment.length + maintenanceEquipment.length + inactiveEquipment.length + retiredEquipment.length, active: activeEquipment.length, inMaintenance: maintenanceEquipment.length, inactive: inactiveEquipment.length },
      maintenance: { open: openOrders.length + inProgressOrders.length, completedInPeriod: completedOrders.length, downtimeMinutes: completedOrders.reduce((s,x)=>s+(x.downtimeMinutes??0),0) },
      inventory: { activeItems: items.filter(x=>x.status==="active").length, balanceLines: balances.length, totalQuantity: balances.reduce((s,x)=>s+x.quantity,0), lowStockLines: balances.filter(b=>{const item=items.find(i=>i._id===b.itemId);return !!item&&b.quantity<item.minimumQuantity;}).length },
      stations: stations.length,
    };
  },
});




export const listImportedProductionPage = query({
  args: {
    stationId: v.optional(v.id("stations")),
    fromAt: v.optional(v.number()),
    toAt: v.optional(v.number()),
    customer: v.optional(v.string()),
    project: v.optional(v.string()),
    mix: v.optional(v.string()),
    mixer: v.optional(v.string()),
    driver: v.optional(v.string()),
    job: v.optional(v.string()),
    state: v.optional(v.string()),
    pump: v.optional(v.string()),
    location: v.optional(v.string()),
    siteNo: v.optional(v.string()),
    contract: v.optional(v.string()),
    techReq: v.optional(v.string()),
    deliveryMode: v.optional(v.string()),
    productionLine: v.optional(v.string()),
    operator: v.optional(v.string()),
    truckVolume: v.optional(v.string()),
    slump: v.optional(v.string()),
    kangShen: v.optional(v.string()),
    readState: v.optional(v.string()),
    attenderCode: v.optional(v.string()),
    constUnit: v.optional(v.string()),
    saJiangSymbol: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "production.view");
    const fromAt = args.fromAt ?? 0;
    const toAt = args.toAt ?? Date.now();
    if (fromAt > toAt) throw new Error("INVALID_PRODUCTION_RANGE");
    const base = args.stationId
      ? ctx.db.query("stationProductionImports").withIndex("by_station_time", q =>
          q.eq("stationId", args.stationId!).gte("productionAt", fromAt).lte("productionAt", toAt))
      : ctx.db.query("stationProductionImports").withIndex("by_productionAt", q =>
          q.gte("productionAt", fromAt).lte("productionAt", toAt));
    const filtered = base.filter(q => q.and(
      (!args.customer || q.or(q.eq(q.field("customerName"), args.customer), q.eq(q.field("rawSourceData.CUST_NM"), args.customer))) &&
      (!args.project || q.or(q.eq(q.field("projectName"), args.project), q.eq(q.field("rawSourceData.PROJ_NM"), args.project))) &&
      (!args.mix || q.or(q.eq(q.field("concreteGrade"), args.mix), q.eq(q.field("rawSourceData.Strength"), args.mix))) &&
      (!args.mixer || q.or(q.eq(q.field("truckNo"), args.mixer), q.eq(q.field("rawSourceData.Truck_No"), args.mixer))) &&
      (!args.driver || q.or(q.eq(q.field("driverName"), args.driver), q.eq(q.field("rawSourceData.Driver"), args.driver))) &&
      (!args.job || q.or(q.eq(q.field("jobNo"), args.job), q.eq(q.field("rawSourceData.Job_No"), args.job))) &&
      (!args.state || q.or(q.eq(q.field("operationState"), args.state), q.eq(q.field("rawSourceData.OperationState"), args.state))) &&
      (!args.pump || q.eq(q.field("rawSourceData.Prop_No"), args.pump)) &&
      (!args.location || q.eq(q.field("rawSourceData.Location"), args.location)) &&
      (!args.siteNo || q.eq(q.field("rawSourceData.Site_No"), args.siteNo)) &&
      (!args.contract || q.eq(q.field("rawSourceData.Contr_No"), args.contract)) &&
      (!args.techReq || q.eq(q.field("rawSourceData.Tech_Req"), args.techReq)) &&
      (!args.deliveryMode || q.eq(q.field("rawSourceData.Delivery_Mode"), args.deliveryMode)) &&
      (!args.productionLine || q.eq(q.field("rawSourceData.ProduceLine"), args.productionLine)) &&
      (!args.operator || q.or(q.eq(q.field("operatorName"), args.operator), q.eq(q.field("rawSourceData.Operator"), args.operator))) &&
      (!args.truckVolume || q.eq(q.field("rawSourceData.Truck_vol"), args.truckVolume)) &&
      (!args.slump || q.eq(q.field("rawSourceData.TaLuoDu"), args.slump)) &&
      (!args.kangShen || q.eq(q.field("rawSourceData.KangShenLevel"), args.kangShen)) &&
      (!args.readState || q.eq(q.field("rawSourceData.ReadState"), args.readState)) &&
      (!args.attenderCode || q.eq(q.field("rawSourceData.AttemperCode"), args.attenderCode)) &&
      (!args.constUnit || q.eq(q.field("rawSourceData.Const_Unit"), args.constUnit)) &&
      (!args.saJiangSymbol || q.eq(q.field("rawSourceData.SaJiangSymbol"), args.saJiangSymbol))
    ));
    const page = await filtered.order("desc").paginate(args.paginationOpts);
    const stations = await ctx.db.query("stations").collect();
    const names = new Map(stations.map(station => [station._id, { name: station.name, code: station.code }]));
    return { ...page, page: page.page.map(record => ({ ...record, station: names.get(record.stationId) ?? null })) };
  },
});

export const listImportedProduction = query({
  args: {
    stationId: v.optional(v.id("stations")),
    fromAt: v.optional(v.number()),
    toAt: v.optional(v.number()),
    customerName: v.optional(v.string()),
    projectName: v.optional(v.string()),
    jobNo: v.optional(v.string()),
    concreteGrade: v.optional(v.string()),
    truckNo: v.optional(v.string()),
    operatorName: v.optional(v.string()),
    operationState: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "production.view");
    const fromAt = args.fromAt ?? 0, toAt = args.toAt ?? Date.now();
    const limit = Math.max(1, Math.min(1000, Math.floor(args.limit ?? 1000)));
    if (fromAt > toAt) throw new Error("INVALID_PRODUCTION_RANGE");
    const rows = args.stationId
      ? await ctx.db.query("stationProductionImports")
          .withIndex("by_station_time", q => q.eq("stationId", args.stationId!).gte("productionAt", fromAt).lte("productionAt", toAt))
          .order("desc").take(limit)
      : await ctx.db.query("stationProductionImports")
          .withIndex("by_productionAt", q => q.gte("productionAt", fromAt).lte("productionAt", toAt))
          .order("desc").take(limit);
    const matches = (actual: string | undefined, expected: string | undefined) =>
      !expected || (actual ?? "").trim().toLocaleLowerCase("ar").includes(expected.trim().toLocaleLowerCase("ar"));
    const filtered = rows.filter(r => matches(r.customerName, args.customerName)
      && matches(r.projectName, args.projectName) && matches(r.jobNo, args.jobNo)
      && matches(r.concreteGrade, args.concreteGrade) && matches(r.truckNo, args.truckNo)
      && matches(r.operatorName, args.operatorName) && matches(r.operationState, args.operationState));
    const stations = await ctx.db.query("stations").collect();
    const names = new Map(stations.map(s => [s._id, { name: s.name, code: s.code }]));
    return filtered.map(r => ({ ...r, station: names.get(r.stationId) ?? null }));
  },
});
