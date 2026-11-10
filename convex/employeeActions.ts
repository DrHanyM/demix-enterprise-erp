import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCentralPermission } from "./lib/auth";
import { appendAuditLog } from "./lib/audit";

const DATE=/^\d{4}-\d{2}-\d{2}$/;
function op(s:string){if(s.trim().length<10||s.length>200)throw new Error("INVALID_OPERATION_ID");}
export const listEmployeeActions=query({
 args:{employeeId:v.optional(v.id("employees"))},
 handler:async(ctx,args)=>{
  await requireCentralPermission(ctx,"hr.actions.manage");
  const [employees,actions]=await Promise.all([ctx.db.query("employees").collect(),ctx.db.query("employeeActions").collect()]);
  return {employees:employees.filter(e=>e.status==="active").sort((a,b)=>a.employeeNo.localeCompare(b.employeeNo)),
   actions:actions.filter(a=>!args.employeeId||a.employeeId===args.employeeId).sort((a,b)=>b.createdAt-a.createdAt)};
 }
});
export const createEmployeeAction=mutation({
 args:{employeeId:v.id("employees"),actionType:v.union(v.literal("sanction"),v.literal("reward")),category:v.string(),description:v.string(),effectiveDate:v.string(),amount:v.optional(v.number()),operationId:v.string()},
 handler:async(ctx,args)=>{
  const {user}=await requireCentralPermission(ctx,"hr.actions.manage");op(args.operationId);
  if(!DATE.test(args.effectiveDate)||Number.isNaN(Date.parse(args.effectiveDate+"T00:00:00Z")))throw new Error("INVALID_EFFECTIVE_DATE");
  const category=args.category.trim(),description=args.description.trim();
  if(!category||category.length>100||!description||description.length>1000)throw new Error("INVALID_ACTION_DETAILS");
  if(args.amount!==undefined&&(!Number.isFinite(args.amount)||args.amount<=0||args.amount>100000000))throw new Error("INVALID_ACTION_AMOUNT");
  const employee=await ctx.db.get(args.employeeId);if(!employee||employee.status!=="active")throw new Error("EMPLOYEE_NOT_ACTIVE");
  const id=await ctx.db.insert("employeeActions",{employeeId:args.employeeId,actionType:args.actionType,category,description,effectiveDate:args.effectiveDate,amount:args.amount,status:"pending",createdBy:user._id,createdAt:Date.now(),updatedAt:Date.now()});
  await appendAuditLog(ctx,{stationId:employee.stationId,action:"hr.employee_action.create",entityType:"employee_action",entityId:id,operationId:args.operationId,details:{employeeId:args.employeeId,actionType:args.actionType,category,amount:args.amount}});
  return {success:true,id};
 }
});
export const reviewEmployeeAction=mutation({
 args:{actionId:v.id("employeeActions"),decision:v.union(v.literal("approved"),v.literal("rejected")),reviewNote:v.optional(v.string()),operationId:v.string()},
 handler:async(ctx,args)=>{
  const {user}=await requireCentralPermission(ctx,"hr.actions.manage");op(args.operationId);
  const action=await ctx.db.get(args.actionId);if(!action||action.status!=="pending")throw new Error("PENDING_ACTION_NOT_FOUND");
  const note=args.reviewNote?.trim();if(note&&note.length>1000)throw new Error("REVIEW_NOTE_TOO_LONG");
  await ctx.db.patch(args.actionId,{status:args.decision,reviewNote:note,reviewedBy:user._id,reviewedAt:Date.now(),updatedAt:Date.now()});
  const employee=await ctx.db.get(action.employeeId);
  await appendAuditLog(ctx,{stationId:employee?.stationId,action:"hr.employee_action.review",entityType:"employee_action",entityId:args.actionId,operationId:args.operationId,details:{decision:args.decision,amount:action.amount}});
  return {success:true};
 }
});
