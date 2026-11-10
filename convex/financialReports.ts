import {v} from "convex/values";
import {query} from "./_generated/server";
import {requireCentralPermission} from "./lib/auth";
export const getFinancialSummary=query({args:{from:v.optional(v.string()),to:v.optional(v.string())},handler:async(ctx,args)=>{
 await requireCentralPermission(ctx,"reports.financial.view");
 if(args.from&&args.to&&args.from>args.to)throw new Error("INVALID_REPORT_RANGE");
 const [runs,loans,repayments,actions]=await Promise.all([ctx.db.query("payrollRuns").collect(),ctx.db.query("employeeLoans").collect(),ctx.db.query("loanRepayments").collect(),ctx.db.query("employeeActions").collect()]);
 const inRange=(d:string)=> (!args.from||d>=args.from)&&(!args.to||d<=args.to);
 const closedRuns=runs.filter(r=>r.status==="closed"&&inRange(r.periodStart)).sort((a,b)=>b.periodStart.localeCompare(a.periodStart));
 const disbursedLoans=loans.filter(l=>l.status==="disbursed"||l.status==="closed");
 const actionRows=actions.filter(a=>a.status==="approved"&&inRange(a.effectiveDate));
 const rewardTotal=actionRows.filter(a=>a.actionType==="reward").reduce((s,a)=>s+(a.amount??0),0);
 const sanctionTotal=actionRows.filter(a=>a.actionType==="sanction").reduce((s,a)=>s+(a.amount??0),0);
 const repaymentRows=repayments.filter(r=>inRange(r.repaymentDate));
 return {
  payroll:{runsCount:closedRuns.length,employeesCount:closedRuns.reduce((s,r)=>s+r.employeeCount,0),grossTotal:closedRuns.reduce((s,r)=>s+r.grossTotal,0),deductionTotal:closedRuns.reduce((s,r)=>s+r.deductionTotal,0),netTotal:closedRuns.reduce((s,r)=>s+r.netTotal,0),runs:closedRuns},
  loans:{activeCount:disbursedLoans.filter(l=>l.status==="disbursed").length,outstandingTotal:disbursedLoans.reduce((s,l)=>s+(l.outstandingAmount??0),0),disbursedTotal:disbursedLoans.reduce((s,l)=>s+(l.approvedAmount??0),0),repaidInRange:repaymentRows.reduce((s,r)=>s+r.amount,0),repayments:repaymentRows},
  actions:{approvedCount:actionRows.length,rewardsTotal:rewardTotal,sanctionsTotal:sanctionTotal,rows:actionRows.sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate))}
 };
}});
