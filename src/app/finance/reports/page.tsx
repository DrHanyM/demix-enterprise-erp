"use client";

import BackToDashboard from "@/components/BackToDashboard";import EnsureCentralAdminBootstrap from "../../../components/EnsureCentralAdminBootstrap";
import {useState} from "react";
import {useQuery} from "convex/react";
import {api} from "../../../../convex/_generated/api";
const f="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm";
const n=(v:number)=>v.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2});
export default function FinancialReportsPage(){
 const [from,setFrom]=useState(new Date().getFullYear()+"-01-01"),[to,setTo]=useState(new Date().toISOString().slice(0,10));
 const data=useQuery(api.financialReports.getFinancialSummary,{from,to});
 const cards=data?[...data.payroll.currencyTotals.flatMap(x=>[["إجمالي الرواتب ("+x.currency+")",n(x.grossTotal)],["استقطاعات الرواتب ("+x.currency+")",n(x.deductionTotal)],["صافي الرواتب ("+x.currency+")",n(x.netTotal)]]),["رصيد القروض القائم",n(data.loans.outstandingTotal)],["السداد خلال الفترة",n(data.loans.repaidInRange)],["المكافآت المعتمدة",n(data.actions.rewardsTotal)],["الجزاءات المالية",n(data.actions.sanctionsTotal)]]:[];
 return <main dir="rtl" className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-7"><EnsureCentralAdminBootstrap /><div className="mx-auto max-w-7xl space-y-6">
 <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold text-teal-700">DEMIX ERP / FINANCE</p><h1 className="mt-2 text-2xl font-extrabold">التقارير المالية</h1><p className="mt-2 text-sm text-slate-500">مؤشرات مستخرجة من مسيرات الرواتب المقفلة والسلف والسداد والجزاءات والمكافآت المعتمدة.</p></div><BackToDashboard /></header>
 <section className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-5"><label className="text-xs font-semibold">من تاريخ<input type="date" className={f+" block mt-1"} value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-xs font-semibold">إلى تاريخ<input type="date" className={f+" block mt-1"} value={to} onChange={e=>setTo(e.target.value)}/></label></section>
 {!data?<p className="text-sm text-slate-500">جارٍ تحميل التقرير...</p>:<>
 <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value])=><article key={label} className="rounded-xl border bg-white p-5"><p className="text-xs text-slate-500">{label}</p><p className="mt-3 text-xl font-extrabold">{value}</p></article>)}</section>
 <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">مسيرات الرواتب المقفلة</h2><p className="mt-1 text-xs text-slate-500">عدد المسيرات: {data.payroll.runsCount} · إجمالي سجلات الموظفين: {data.payroll.currencyTotals.reduce((sum,x)=>sum+x.employeesCount,0)}</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[700px] text-right text-xs"><thead className="bg-slate-100"><tr>{["الفترة","العملة","عدد الموظفين","الإجمالي","الاستقطاعات","الصافي"].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{data.payroll.runs.map(r=><tr key={r._id} className="border-t"><td className="p-3">{r.periodStart} – {r.periodEnd}</td><td className="p-3">{r.currency}</td><td className="p-3">{r.employeeCount}</td><td className="p-3">{n(r.grossTotal)}</td><td className="p-3">{n(r.deductionTotal)}</td><td className="p-3 font-bold">{n(r.netTotal)}</td></tr>)}</tbody></table></div></section>
 <section className="grid gap-5 xl:grid-cols-2"><div className="rounded-xl border bg-white p-5"><h2 className="font-bold">موقف السلف والقروض</h2><p className="mt-3 text-sm">عدد القروض المصروفة القائمة: {data.loans.activeCount}</p><p className="mt-2 text-sm">إجمالي ما تم اعتماده وصرفه: {n(data.loans.disbursedTotal)}</p><p className="mt-2 text-sm">إجمالي الرصيد القائم: {n(data.loans.outstandingTotal)}</p><p className="mt-2 text-sm">إجمالي السداد خلال الفترة: {n(data.loans.repaidInRange)}</p></div><div className="rounded-xl border bg-white p-5"><h2 className="font-bold">الجزاءات والمكافآت</h2><p className="mt-3 text-sm">عدد الإجراءات المعتمدة: {data.actions.approvedCount}</p><p className="mt-2 text-sm">إجمالي المكافآت المالية: {n(data.actions.rewardsTotal)}</p><p className="mt-2 text-sm">إجمالي الجزاءات المالية: {n(data.actions.sanctionsTotal)}</p></div></section>
 </>}
 </div></main>;
}
