import {v} from "convex/values";
import {mutation,query} from "./_generated/server";
import {requireCentralPermission} from "./lib/auth";
import {appendAuditLog} from "./lib/audit";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function op(s:string){if(s.trim().length<10||s.length>200)throw new Error("INVALID_OPERATION_ID");}
function money(n:number){if(!Number.isFinite(n)||n<0||n>1000000000)throw new Error("INVALID_PAYROLL_AMOUNT");return Math.round(n*100)/100;}
function totals(entries:{grossPay:number;totalDeductions:number;netPay:number}[]){return {employeeCount:entries.length,grossTotal:entries.reduce((s,e)=>s+e.grossPay,0),deductionTotal:entries.reduce((s,e)=>s+e.totalDeductions,0),netTotal:entries.reduce((s,e)=>s+e.netPay,0)};}
export const listPayrollSetup=query({args:{runId:v.optional(v.id("payrollRuns"))},handler:async(ctx,args)=>{
 await requireCentralPermission(ctx,"payroll.manage");
 const [employees,profiles,runs]=await Promise.all([ctx.db.query("employees").collect(),ctx.db.query("compensationProfiles").collect(),ctx.db.query("payrollRuns").collect()]);
 const entries=args.runId?await ctx.db.query("payrollEntries").withIndex("by_run",q=>q.eq("payrollRunId",args.runId!)).collect():[];
 return {employees:employees.filter(e=>e.status==="active").sort((a,b)=>a.employeeNo.localeCompare(b.employeeNo)),profiles,runs:runs.sort((a,b)=>b.periodStart.localeCompare(a.periodStart)),entries};
}});
export const saveCompensationProfile=mutation({args:{employeeId:v.id("employees"),currency:v.string(),basicSalary:v.number(),fixedAllowances:v.number(),fixedDeductions:v.number(),effectiveFrom:v.string(),operationId:v.string()},handler:async(ctx,args)=>{
 const {user}=await requireCentralPermission(ctx,"payroll.manage");op(args.operationId);
 if(!DATE.test(args.effectiveFrom)||Number.isNaN(Date.parse(args.effectiveFrom+"T00:00:00Z")))throw new Error("INVALID_EFFECTIVE_FROM");
 const currency=args.currency.trim().toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new Error("INVALID_CURRENCY_CODE");
 const basicSalary=money(args.basicSalary),fixedAllowances=money(args.fixedAllowances),fixedDeductions=money(args.fixedDeductions);
 if(basicSalary<=0)throw new Error("BASIC_SALARY_MUST_BE_POSITIVE");
 const employee=await ctx.db.get(args.employeeId);if(!employee||employee.status==="terminated")throw new Error("EMPLOYEE_NOT_PAYABLE");
 const profiles=await ctx.db.query("compensationProfiles").withIndex("by_employee",q=>q.eq("employeeId",args.employeeId)).collect();
 const current=profiles.find(p=>p.status==="active");
 const now=Date.now();
 if(current&&args.effectiveFrom<=current.effectiveFrom)throw new Error("PROFILE_DATE_MUST_BE_AFTER_CURRENT_PROFILE");
 if(current)await ctx.db.patch(current._id,{status:"inactive",updatedAt:now,updatedBy:user._id});
 const id=await ctx.db.insert("compensationProfiles",{employeeId:args.employeeId,currency,basicSalary,fixedAllowances,fixedDeductions,effectiveFrom:args.effectiveFrom,status:"active",updatedBy:user._id,createdAt:now,updatedAt:now});
 await appendAuditLog(ctx,{stationId:employee.stationId,action:current?"payroll.profile.version.create":"payroll.profile.create",entityType:"compensation_profile",entityId:id,operationId:args.operationId,details:{previousProfileId:current?._id,basicSalary,fixedAllowances,fixedDeductions,currency,effectiveFrom:args.effectiveFrom}});
 return {success:true,id};
}});
export const createPayrollRun=mutation({args:{periodStart:v.string(),periodEnd:v.string(),currency:v.string(),operationId:v.string()},handler:async(ctx,args)=>{
 const {user}=await requireCentralPermission(ctx,"payroll.manage");op(args.operationId);
 if(!DATE.test(args.periodStart)||!DATE.test(args.periodEnd)||args.periodEnd<args.periodStart)throw new Error("INVALID_PAYROLL_PERIOD");
 if(args.periodStart.slice(0,7)!==args.periodEnd.slice(0,7))throw new Error("PAYROLL_PERIOD_MUST_BE_WITHIN_ONE_MONTH");
 const currency=args.currency.trim().toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new Error("INVALID_CURRENCY_CODE");
 const duplicates=await ctx.db.query("payrollRuns").withIndex("by_period_currency",q=>q.eq("periodStart",args.periodStart).eq("periodEnd",args.periodEnd).eq("currency",currency)).take(2);
 if(duplicates.length)throw new Error("PAYROLL_RUN_ALREADY_EXISTS");
 const [employees,profiles,actions]=await Promise.all([ctx.db.query("employees").collect(),ctx.db.query("compensationProfiles").collect(),ctx.db.query("employeeActions").collect()]);
 const activeEmployees=employees.filter(e=>e.status==="active");
 const eligible=activeEmployees.map(employee=>({employee,profile:profiles.filter(p=>p.employeeId===employee._id&&p.effectiveFrom<=args.periodEnd&&p.currency===currency).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0]})).filter(x=>x.profile);
 if(!eligible.length)throw new Error("NO_EMPLOYEE_COMPENSATION_PROFILES");
 const now=Date.now();
 const runId=await ctx.db.insert("payrollRuns",{periodStart:args.periodStart,periodEnd:args.periodEnd,currency,status:"draft",employeeCount:0,grossTotal:0,deductionTotal:0,netTotal:0,createdBy:user._id,createdAt:now,updatedAt:now});
 const entries=[];
 for(const {employee,profile} of eligible){
  const approved=actions.filter(a=>a.employeeId===employee._id&&a.status==="approved"&&a.effectiveDate>=args.periodStart&&a.effectiveDate<=args.periodEnd&&a.amount!==undefined);
  const rewards=approved.filter(a=>a.actionType==="reward").reduce((s,a)=>s+(a.amount??0),0);
  const sanctions=approved.filter(a=>a.actionType==="sanction").reduce((s,a)=>s+(a.amount??0),0);
  const gross=money(profile!.basicSalary+profile!.fixedAllowances+rewards);
  const deductions=money(profile!.fixedDeductions+sanctions);
  const net=money(gross-deductions);
  if(net<0)throw new Error("NEGATIVE_NET_PAY_FOR_EMPLOYEE_"+employee.employeeNo);
  const id=await ctx.db.insert("payrollEntries",{payrollRunId:runId,employeeId:employee._id,currency:profile!.currency,basicSalary:profile!.basicSalary,fixedAllowances:profile!.fixedAllowances,overtimeAmount:0,rewardsAmount:rewards,otherEarnings:0,fixedDeductions:profile!.fixedDeductions,absenceDeductions:0,sanctionsDeductions:sanctions,loanDeductions:0,otherDeductions:0,grossPay:gross,totalDeductions:deductions,netPay:net,updatedAt:now});
  entries.push({id,grossPay:gross,totalDeductions:deductions,netPay:net});
 }
 const t=totals(entries);
 await ctx.db.patch(runId,{...t,updatedAt:Date.now()});
 await appendAuditLog(ctx,{action:"payroll.run.create",entityType:"payroll_run",entityId:runId,operationId:args.operationId,details:{periodStart:args.periodStart,periodEnd:args.periodEnd,...t,activeEmployees:activeEmployees.length,missingProfiles:activeEmployees.length-eligible.length}});
 return {success:true,runId,...t,missingProfiles:activeEmployees.length-eligible.length};
}});
export const updatePayrollEntry=mutation({args:{entryId:v.id("payrollEntries"),overtimeAmount:v.number(),otherEarnings:v.number(),absenceDeductions:v.number(),loanDeductions:v.number(),otherDeductions:v.number(),operationId:v.string()},handler:async(ctx,args)=>{
 const {user}=await requireCentralPermission(ctx,"payroll.manage");op(args.operationId);
 const entry=await ctx.db.get(args.entryId);if(!entry)throw new Error("PAYROLL_ENTRY_NOT_FOUND");
 const run=await ctx.db.get(entry.payrollRunId);if(!run||run.status!=="draft")throw new Error("PAYROLL_RUN_NOT_EDITABLE");
 const overtimeAmount=money(args.overtimeAmount),otherEarnings=money(args.otherEarnings),absenceDeductions=money(args.absenceDeductions),loanDeductions=money(args.loanDeductions),otherDeductions=money(args.otherDeductions);
 const gross=money(entry.basicSalary+entry.fixedAllowances+entry.rewardsAmount+overtimeAmount+otherEarnings);
 const deductions=money(entry.fixedDeductions+entry.sanctionsDeductions+absenceDeductions+loanDeductions+otherDeductions);
 const net=money(gross-deductions);if(net<0)throw new Error("NEGATIVE_NET_PAY");
 await ctx.db.patch(args.entryId,{overtimeAmount,otherEarnings,absenceDeductions,loanDeductions,otherDeductions,grossPay:gross,totalDeductions:deductions,netPay:net,updatedAt:Date.now()});
 const all=await ctx.db.query("payrollEntries").withIndex("by_run",q=>q.eq("payrollRunId",run._id)).collect();
 const updated=all.map(e=>e._id===args.entryId?{grossPay:gross,totalDeductions:deductions,netPay:net}:e);
 await ctx.db.patch(run._id,{...totals(updated),updatedAt:Date.now()});
 const employee=await ctx.db.get(entry.employeeId);
 await appendAuditLog(ctx,{stationId:employee?.stationId,action:"payroll.entry.update",entityType:"payroll_entry",entityId:args.entryId,operationId:args.operationId,details:{overtimeAmount,otherEarnings,absenceDeductions,loanDeductions,otherDeductions,netPay:net,actor:user._id}});
 return {success:true,netPay:net};
}});
export const transitionPayrollRun=mutation({args:{runId:v.id("payrollRuns"),decision:v.union(v.literal("approve"),v.literal("close")),operationId:v.string()},handler:async(ctx,args)=>{
 const {user}=await requireCentralPermission(ctx,"payroll.manage");op(args.operationId);
 const run=await ctx.db.get(args.runId);if(!run)throw new Error("PAYROLL_RUN_NOT_FOUND");
 const entries=await ctx.db.query("payrollEntries").withIndex("by_run",q=>q.eq("payrollRunId",args.runId)).collect();
 if(!entries.length)throw new Error("EMPTY_PAYROLL_RUN");
 if(args.decision==="approve"){
  if(run.status!=="draft")throw new Error("PAYROLL_RUN_NOT_DRAFT");
  await ctx.db.patch(args.runId,{status:"approved",approvedBy:user._id,approvedAt:Date.now(),updatedAt:Date.now()});
 }else{
  if(run.status!=="approved")throw new Error("PAYROLL_RUN_NOT_APPROVED");
  await ctx.db.patch(args.runId,{status:"closed",closedBy:user._id,closedAt:Date.now(),updatedAt:Date.now()});
 }
 await appendAuditLog(ctx,{action:args.decision==="approve"?"payroll.run.approve":"payroll.run.close",entityType:"payroll_run",entityId:args.runId,operationId:args.operationId,details:{employeeCount:entries.length,netTotal:run.netTotal}});
 return {success:true};
}});
