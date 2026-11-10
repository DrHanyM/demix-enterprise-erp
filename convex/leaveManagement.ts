import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCentralPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LEAVE = v.union(v.literal("annual"), v.literal("sick"), v.literal("casual"), v.literal("unpaid"));
const REQUEST = v.union(LEAVE, v.literal("mission"));

function validDate(value: string) {
  if (!DATE.test(value)) throw new Error("INVALID_DATE");
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("INVALID_DATE");
}
function daysBetween(start: string, end: string) {
  return Math.floor((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000) + 1;
}
function operation(value: string) {
  if (value.trim().length < 10 || value.length > 200) throw new Error("INVALID_OPERATION_ID");
  return value.trim();
}

export const listLeaveManagement = query({
  args: { year: v.optional(v.number()), employeeId: v.optional(v.id("employees")) },
  handler: async (ctx, args) => {
    await requireCentralPermission(ctx, "hr.leave.manage");
    const [employees, requests, balances] = await Promise.all([
      ctx.db.query("employees").collect(),
      ctx.db.query("leaveRequests").collect(),
      ctx.db.query("leaveBalances").collect(),
    ]);
    const activeEmployees = employees.filter(e => e.status === "active").sort((a,b)=>a.employeeNo.localeCompare(b.employeeNo));
    const filteredRequests = requests.filter(r => (!args.employeeId || r.employeeId === args.employeeId) &&
      (!args.year || r.startDate.startsWith(String(args.year))));
    const filteredBalances = balances.filter(b => (!args.employeeId || b.employeeId === args.employeeId) &&
      (!args.year || b.year === args.year));
    return {
      employees: activeEmployees,
      requests: filteredRequests.sort((a,b)=>b.createdAt-a.createdAt),
      balances: filteredBalances,
    };
  },
});

export const setLeaveBalance = mutation({
  args: {
    employeeId: v.id("employees"), year: v.number(),
    leaveType: LEAVE, allocatedDays: v.number(), adjustmentDays: v.number(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCentralPermission(ctx, "hr.leave.manage");
    operation(args.operationId);
    if (!Number.isInteger(args.year) || args.year < 2000 || args.year > 2200) throw new Error("INVALID_YEAR");
    if (!Number.isFinite(args.allocatedDays) || args.allocatedDays < 0 || args.allocatedDays > 366 ||
        !Number.isFinite(args.adjustmentDays) || Math.abs(args.adjustmentDays) > 366) throw new Error("INVALID_BALANCE");
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
    const matches = await ctx.db.query("leaveBalances").withIndex("by_employee_year",q=>q.eq("employeeId",args.employeeId).eq("year",args.year)).collect();
    const current = matches.find(x=>x.leaveType===args.leaveType);
    if (current && current.usedDays > args.allocatedDays + args.adjustmentDays) throw new Error("BALANCE_BELOW_ALREADY_USED_DAYS");
    const now=Date.now();
    if (current) {
      await ctx.db.patch(current._id,{allocatedDays:args.allocatedDays,adjustmentDays:args.adjustmentDays,updatedAt:now,updatedBy:user._id});
      await appendAuditLog(ctx,{action:"hr.leave.balance.update",entityType:"leave_balance",entityId:current._id,operationId:args.operationId,details:{employeeId:args.employeeId,year:args.year,leaveType:args.leaveType,allocatedDays:args.allocatedDays,adjustmentDays:args.adjustmentDays}});
      return {success:true,id:current._id};
    }
    const id=await ctx.db.insert("leaveBalances",{employeeId:args.employeeId,year:args.year,leaveType:args.leaveType,allocatedDays:args.allocatedDays,adjustmentDays:args.adjustmentDays,usedDays:0,updatedAt:now,updatedBy:user._id});
    await appendAuditLog(ctx,{action:"hr.leave.balance.create",entityType:"leave_balance",entityId:id,operationId:args.operationId,details:{employeeId:args.employeeId,year:args.year,leaveType:args.leaveType,allocatedDays:args.allocatedDays,adjustmentDays:args.adjustmentDays}});
    return {success:true,id};
  },
});

export const createLeaveRequest = mutation({
  args: {
    employeeId:v.id("employees"),requestType:REQUEST,startDate:v.string(),endDate:v.string(),
    reason:v.string(),destination:v.optional(v.string()),operationId:v.string(),
  },
  handler: async (ctx,args) => {
    const {user}=await requireCentralPermission(ctx,"hr.leave.manage");
    operation(args.operationId); validDate(args.startDate); validDate(args.endDate);
    if(args.endDate<args.startDate) throw new Error("END_DATE_BEFORE_START");
    const days=daysBetween(args.startDate,args.endDate);
    if(days>366) throw new Error("REQUEST_TOO_LONG");
    const reason=args.reason.trim();
    if(!reason||reason.length>1000) throw new Error("INVALID_REASON");
    const destination=args.destination?.trim();
    if(args.requestType==="mission" && !destination) throw new Error("MISSION_DESTINATION_REQUIRED");
    const employee=await ctx.db.get(args.employeeId);
    if(!employee||employee.status!=="active") throw new Error("EMPLOYEE_NOT_ACTIVE");
    const existing=await ctx.db.query("leaveRequests").withIndex("by_employee",q=>q.eq("employeeId",args.employeeId)).collect();
    const overlap=existing.some(r=>(r.status==="pending"||r.status==="approved")&&r.startDate<=args.endDate&&args.startDate<=r.endDate);
    if(overlap) throw new Error("REQUEST_DATE_OVERLAP");
    const now=Date.now();
    const id=await ctx.db.insert("leaveRequests",{employeeId:args.employeeId,requestType:args.requestType,startDate:args.startDate,endDate:args.endDate,days,reason,destination:destination||undefined,status:"pending",createdBy:user._id,createdAt:now,updatedAt:now});
    await appendAuditLog(ctx,{stationId:employee.stationId,action:"hr.leave.request.create",entityType:"leave_request",entityId:id,operationId:args.operationId,details:{employeeId:args.employeeId,requestType:args.requestType,startDate:args.startDate,endDate:args.endDate,days}});
    return {success:true,id,days};
  },
});

export const reviewLeaveRequest = mutation({
  args:{requestId:v.id("leaveRequests"),decision:v.union(v.literal("approved"),v.literal("rejected")),reviewNote:v.optional(v.string()),operationId:v.string()},
  handler:async(ctx,args)=>{
    const {user}=await requireCentralPermission(ctx,"hr.leave.manage");
    operation(args.operationId);
    const request=await ctx.db.get(args.requestId);
    if(!request||request.status!=="pending") throw new Error("PENDING_REQUEST_NOT_FOUND");
    const note=args.reviewNote?.trim();
    if(note&&note.length>1000) throw new Error("REVIEW_NOTE_TOO_LONG");
    let balanceId;
    if(args.decision==="approved" && request.requestType!=="mission" && request.requestType!=="unpaid"){
      const year=Number(request.startDate.slice(0,4));
      if(Number(request.endDate.slice(0,4))!==year) throw new Error("CROSS_YEAR_LEAVE_REQUEST_NOT_SUPPORTED");
      const balances=await ctx.db.query("leaveBalances").withIndex("by_employee_year",q=>q.eq("employeeId",request.employeeId).eq("year",year)).collect();
      const balance=balances.find(b=>b.leaveType===request.requestType);
      if(!balance) throw new Error("LEAVE_BALANCE_NOT_CONFIGURED");
      if(balance.usedDays+request.days>balance.allocatedDays+balance.adjustmentDays) throw new Error("INSUFFICIENT_LEAVE_BALANCE");
      balanceId=balance._id;
      await ctx.db.patch(balance._id,{usedDays:balance.usedDays+request.days,updatedAt:Date.now(),updatedBy:user._id});
    }
    const now=Date.now();
    await ctx.db.patch(args.requestId,{status:args.decision,reviewNote:note,reviewedBy:user._id,reviewedAt:now,updatedAt:now});
    const employee=await ctx.db.get(request.employeeId);
    await appendAuditLog(ctx,{stationId:employee?.stationId,action:"hr.leave.request.review",entityType:"leave_request",entityId:args.requestId,operationId:args.operationId,details:{decision:args.decision,reviewNote:note,balanceId,days:request.days}});
    return {success:true};
  },
});

export const cancelLeaveRequest = mutation({
  args:{requestId:v.id("leaveRequests"),operationId:v.string()},
  handler:async(ctx,args)=>{
    const {user}=await requireCentralPermission(ctx,"hr.leave.manage");
    operation(args.operationId);
    const request=await ctx.db.get(args.requestId);
    if(!request||request.status==="cancelled"||request.status==="rejected") throw new Error("CANCELLABLE_REQUEST_NOT_FOUND");
    if(request.status==="approved" && request.requestType!=="mission" && request.requestType!=="unpaid"){
      const year=Number(request.startDate.slice(0,4));
      const rows=await ctx.db.query("leaveBalances").withIndex("by_employee_year",q=>q.eq("employeeId",request.employeeId).eq("year",year)).collect();
      const balance=rows.find(b=>b.leaveType===request.requestType);
      if(balance) await ctx.db.patch(balance._id,{usedDays:Math.max(0,balance.usedDays-request.days),updatedAt:Date.now(),updatedBy:user._id});
    }
    await ctx.db.patch(args.requestId,{status:"cancelled",updatedAt:Date.now()});
    const employee=await ctx.db.get(request.employeeId);
    await appendAuditLog(ctx,{stationId:employee?.stationId,action:"hr.leave.request.cancel",entityType:"leave_request",entityId:args.requestId,operationId:args.operationId,details:{previousStatus:request.status}});
    return {success:true};
  },
});
