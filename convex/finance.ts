import {v} from "convex/values";
import {mutation,query} from "./_generated/server";
import {requireCentralPermission} from "./lib/auth";
import {appendAuditLog} from "./lib/audit";
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function op(s:string){if(s.trim().length<10||s.length>200)throw new Error("INVALID_OPERATION_ID");}
export const listLoans=query({args:{employeeId:v.optional(v.id("employees"))},handler:async(ctx,args)=>{
 await requireCentralPermission(ctx,"finance.advances.manage");
 const [employees,loans,repayments]=await Promise.all([ctx.db.query("employees").collect(),ctx.db.query("employeeLoans").collect(),ctx.db.query("loanRepayments").collect()]);
 return {employees:employees.filter(e=>e.status==="active").sort((a,b)=>a.employeeNo.localeCompare(b.employeeNo)),loans:loans.filter(l=>!args.employeeId||l.employeeId===args.employeeId).sort((a,b)=>b.createdAt-a.createdAt),repayments:repayments.filter(r=>!args.employeeId||r.employeeId===args.employeeId).sort((a,b)=>b.createdAt-a.createdAt)};
}});
export const createLoanRequest=mutation({args:{employeeId:v.id("employees"),loanType:v.union(v.literal("advance"),v.literal("loan")),requestedAmount:v.number(),installmentsCount:v.number(),firstInstallmentMonth:v.string(),reason:v.string(),operationId:v.string()},handler:async(ctx,args)=>{
 const {user}=await requireCentralPermission(ctx,"finance.advances.manage");op(args.operationId);
 if(!Number.isFinite(args.requestedAmount)||args.requestedAmount<=0||args.requestedAmount>100000000)throw new Error("INVALID_REQUESTED_AMOUNT");
 if(!Number.isInteger(args.installmentsCount)||args.installmentsCount<1||args.installmentsCount>120)throw new Error("INVALID_INSTALLMENTS_COUNT");
 if(!MONTH.test(args.firstInstallmentMonth))throw new Error("INVALID_FIRST_INSTALLMENT_MONTH");
 const reason=args.reason.trim();if(!reason||reason.length>1000)throw new Error("INVALID_REASON");
 const employee=await ctx.db.get(args.employeeId);if(!employee||employee.status!=="active")throw new Error("EMPLOYEE_NOT_ACTIVE");
 const id=await ctx.db.insert("employeeLoans",{employeeId:args.employeeId,loanType:args.loanType,requestedAmount:args.requestedAmount,installmentsCount:args.installmentsCount,firstInstallmentMonth:args.firstInstallmentMonth,reason,status:"pending",paidAmount:0,createdBy:user._id,createdAt:Date.now(),updatedAt:Date.now()});
 await appendAuditLog(ctx,{stationId:employee.stationId,action:"finance.loan.request",entityType:"employee_loan",entityId:id,operationId:args.operationId,details:{loanType:args.loanType,requestedAmount:args.requestedAmount,installmentsCount:args.installmentsCount}});
 return {success:true,id};
}});
export const reviewLoanRequest=mutation({args:{loanId:v.id("employeeLoans"),decision:v.union(v.literal("approved"),v.literal("rejected")),approvedAmount:v.optional(v.number()),installmentsCount:v.optional(v.number()),reviewNote:v.optional(v.string()),operationId:v.string()},handler:async(ctx,args)=>{
 const {user}=await requireCentralPermission(ctx,"finance.advances.manage");op(args.operationId);
 const loan=await ctx.db.get(args.loanId);if(!loan||loan.status!=="pending")throw new Error("PENDING_LOAN_NOT_FOUND");
 const note=args.reviewNote?.trim();if(note&&note.length>1000)throw new Error("REVIEW_NOTE_TOO_LONG");
 let approvedAmount:number|undefined,installmentsCount=loan.installmentsCount,installmentAmount:number|undefined;
 if(args.decision==="approved"){
  approvedAmount=args.approvedAmount??loan.requestedAmount;
  installmentsCount=args.installmentsCount??loan.installmentsCount;
  if(!Number.isFinite(approvedAmount)||approvedAmount<=0||approvedAmount>loan.requestedAmount)throw new Error("INVALID_APPROVED_AMOUNT");
  if(!Number.isInteger(installmentsCount)||installmentsCount<1||installmentsCount>120)throw new Error("INVALID_INSTALLMENTS_COUNT");
  installmentAmount=Math.round((approvedAmount/installmentsCount)*100)/100;
 }
 await ctx.db.patch(args.loanId,{status:args.decision,approvedAmount,installmentsCount,installmentAmount,reviewNote:note,reviewedBy:user._id,reviewedAt:Date.now(),updatedAt:Date.now()});
 const employee=await ctx.db.get(loan.employeeId);
 await appendAuditLog(ctx,{stationId:employee?.stationId,action:"finance.loan.review",entityType:"employee_loan",entityId:args.loanId,operationId:args.operationId,details:{decision:args.decision,approvedAmount,installmentsCount}});
 return {success:true};
}});
export const disburseLoan=mutation({args:{loanId:v.id("employeeLoans"),operationId:v.string()},handler:async(ctx,args)=>{
 const {user}=await requireCentralPermission(ctx,"finance.advances.manage");op(args.operationId);
 const loan=await ctx.db.get(args.loanId);if(!loan||loan.status!=="approved"||!loan.approvedAmount)throw new Error("APPROVED_LOAN_NOT_FOUND");
 await ctx.db.patch(args.loanId,{status:"disbursed",outstandingAmount:loan.approvedAmount,disbursedAt:Date.now(),updatedAt:Date.now()});
 const employee=await ctx.db.get(loan.employeeId);
 await appendAuditLog(ctx,{stationId:employee?.stationId,action:"finance.loan.disburse",entityType:"employee_loan",entityId:args.loanId,operationId:args.operationId,details:{amount:loan.approvedAmount}});
 return {success:true};
}});
export const recordLoanRepayment=mutation({args:{loanId:v.id("employeeLoans"),amount:v.number(),repaymentDate:v.string(),method:v.string(),reference:v.optional(v.string()),operationId:v.string()},handler:async(ctx,args)=>{
 const {user}=await requireCentralPermission(ctx,"finance.advances.manage");op(args.operationId);
 if(!Number.isFinite(args.amount)||args.amount<=0)throw new Error("INVALID_REPAYMENT_AMOUNT");
 if(!DATE.test(args.repaymentDate)||Number.isNaN(Date.parse(args.repaymentDate+"T00:00:00Z")))throw new Error("INVALID_REPAYMENT_DATE");
 const method=args.method.trim();if(!method||method.length>60)throw new Error("INVALID_REPAYMENT_METHOD");
 const loan=await ctx.db.get(args.loanId);if(!loan||loan.status!=="disbursed"||loan.outstandingAmount===undefined)throw new Error("DISBURSED_LOAN_NOT_FOUND");
 if(args.amount>loan.outstandingAmount)throw new Error("REPAYMENT_EXCEEDS_OUTSTANDING");
 const employee=await ctx.db.get(loan.employeeId);const outstanding=Math.round((loan.outstandingAmount-args.amount)*100)/100;
 const id=await ctx.db.insert("loanRepayments",{loanId:args.loanId,employeeId:loan.employeeId,amount:args.amount,repaymentDate:args.repaymentDate,method,reference:args.reference?.trim(),recordedBy:user._id,createdAt:Date.now()});
 await ctx.db.patch(args.loanId,{paidAmount:Math.round((loan.paidAmount+args.amount)*100)/100,outstandingAmount:outstanding,status:outstanding===0?"closed":"disbursed",updatedAt:Date.now()});
 await appendAuditLog(ctx,{stationId:employee?.stationId,action:"finance.loan.repayment",entityType:"loan_repayment",entityId:id,operationId:args.operationId,details:{loanId:args.loanId,amount:args.amount,outstanding}});
 return {success:true,id,outstanding};
}});
