"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const field="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm";
const btn="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const types=[["annual","سنوية"],["sick","مرضية"],["casual","عارضة"],["unpaid","بدون أجر"],["mission","مأمورية"]] as const;
const balanceTypes=types.filter(x=>x[0]!=="mission");
const label=(v:string)=>types.find(x=>x[0]===v)?.[1]??v;

export default function LeavesPage(){
 const year=new Date().getFullYear();
 const data=useQuery(api.leaveManagement.listLeaveManagement,{year});
 const create=useMutation(api.leaveManagement.createLeaveRequest);
 const setBalance=useMutation(api.leaveManagement.setLeaveBalance);
 const review=useMutation(api.leaveManagement.reviewLeaveRequest);
 const [employeeId,setEmployeeId]=useState("");
 const [requestType,setRequestType]=useState<"annual"|"sick"|"casual"|"unpaid"|"mission">("annual");
 const [startDate,setStartDate]=useState(new Date().toISOString().slice(0,10));
 const [endDate,setEndDate]=useState(new Date().toISOString().slice(0,10));
 const [reason,setReason]=useState("");
 const [destination,setDestination]=useState("");
 const [balanceType,setBalanceType]=useState<"annual"|"sick"|"casual"|"unpaid">("annual");
 const [allocated,setAllocated]=useState("21");
 const [adjustment,setAdjustment]=useState("0");
 const [busy,setBusy]=useState(false); const [notice,setNotice]=useState(""); const [error,setError]=useState("");
 const employees=useMemo(()=>data?.employees??[],[data]);
 async function run(fn:()=>Promise<unknown>,ok:string){setBusy(true);setError("");setNotice("");try{await fn();setNotice(ok);}catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ العملية.");}finally{setBusy(false);}}
 return <main dir="rtl" className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-7"><div className="mx-auto max-w-7xl space-y-6">
 <header><p className="text-xs font-semibold text-teal-700">DEMIX ERP / HR</p><h1 className="mt-2 text-2xl font-extrabold">الإجازات والمأموريات</h1><p className="mt-2 text-sm text-slate-500">طلبات الإجازة والمأمورية، أرصدة سنوية، ومراجعة واعتماد الطلبات.</p><a href="/" className="mt-3 inline-block text-sm text-blue-700">العودة للرئيسية</a></header>
 {notice&&<div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}{error&&<div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
 <section className="grid gap-5 xl:grid-cols-2">
 <div className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-bold">تسجيل طلب إجازة أو مأمورية</h2>
 <label className="block text-xs font-semibold">الموظف<select className={field} value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">اختر الموظف</option>{employees.map(e=><option key={e._id} value={e._id}>{e.employeeNo} – {e.fullName}</option>)}</select></label>
 <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">نوع الطلب<select className={field} value={requestType} onChange={e=>setRequestType(e.target.value as typeof requestType)}>{types.map(t=><option key={t[0]} value={t[0]}>{t[1]}</option>)}</select></label><label className="text-xs font-semibold">السبب / الغرض<input className={field} value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></label>
 <label className="text-xs font-semibold">من تاريخ<input type="date" className={field} value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label className="text-xs font-semibold">إلى تاريخ<input type="date" className={field} value={endDate} onChange={e=>setEndDate(e.target.value)}/></label></div>
 {requestType==="mission"&&<label className="block text-xs font-semibold">جهة / موقع المأمورية<input className={field} value={destination} onChange={e=>setDestination(e.target.value)}/></label>}
 <button className={btn} disabled={busy||!employeeId||!reason.trim()||endDate<startDate} onClick={()=>void run(()=>create({employeeId:employeeId as Id<"employees">,requestType,startDate,endDate,reason,destination:destination||undefined,operationId:"leave-create-"+crypto.randomUUID()}),"تم تسجيل الطلب وهو بانتظار الاعتماد.")}>حفظ الطلب</button></div>
 <div className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-bold">إعداد رصيد الإجازات</h2><p className="text-xs leading-6 text-slate-500">يُدخل الرصيد المعتمد وفق لائحة الشركة. لا يفترض النظام استحقاقًا قانونيًا تلقائيًا قبل ضبط السياسة.</p>
 <label className="block text-xs font-semibold">الموظف<select className={field} value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">اختر الموظف</option>{employees.map(e=><option key={e._id} value={e._id}>{e.employeeNo} – {e.fullName}</option>)}</select></label>
 <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold">نوع الرصيد<select className={field} value={balanceType} onChange={e=>setBalanceType(e.target.value as typeof balanceType)}>{balanceTypes.map(t=><option key={t[0]} value={t[0]}>{t[1]}</option>)}</select></label><label className="text-xs font-semibold">الرصيد المقرر<input className={field} type="number" min="0" max="366" value={allocated} onChange={e=>setAllocated(e.target.value)}/></label><label className="text-xs font-semibold">تسوية (+/-)<input className={field} type="number" min="-366" max="366" value={adjustment} onChange={e=>setAdjustment(e.target.value)}/></label></div>
 <button className={btn} disabled={busy||!employeeId} onClick={()=>void run(()=>setBalance({employeeId:employeeId as Id<"employees">,year,leaveType:balanceType,allocatedDays:Number(allocated),adjustmentDays:Number(adjustment),operationId:"leave-balance-"+crypto.randomUUID()}),"تم تحديث رصيد الإجازة.")}>حفظ الرصيد</button></div></section>
 <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">أرصدة الموظفين – {year}</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-right text-xs"><thead className="bg-slate-100"><tr>{["الموظف","النوع","المقرر","التسوية","المستخدم","المتبقي"].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{(data?.balances??[]).map(b=>{const e=employees.find(x=>x._id===b.employeeId);return <tr key={b._id} className="border-t"><td className="p-3">{e?.fullName??"—"}</td><td className="p-3">{label(b.leaveType)}</td><td className="p-3">{b.allocatedDays}</td><td className="p-3">{b.adjustmentDays}</td><td className="p-3">{b.usedDays}</td><td className="p-3 font-bold">{b.allocatedDays+b.adjustmentDays-b.usedDays}</td></tr>})}</tbody></table></div></section>
 <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">الطلبات وسير الاعتماد</h2><div className="mt-3 space-y-3">{(data?.requests??[]).map(r=>{const e=employees.find(x=>x._id===r.employeeId);return <article key={r._id} className="rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{e?.employeeNo} – {e?.fullName} · {label(r.requestType)}</strong><span className="text-xs">{r.status==="pending"?"بانتظار الاعتماد":r.status==="approved"?"معتمد":r.status==="rejected"?"مرفوض":"ملغي"}</span></div><p className="mt-2 text-xs text-slate-600">{r.startDate} إلى {r.endDate} · {r.days} يوم</p><p className="mt-1 text-xs">{r.reason}{r.destination?" · الوجهة: "+r.destination:""}</p>{r.status==="pending"&&<div className="mt-3 flex gap-2"><button className={btn} disabled={busy} onClick={()=>void run(()=>review({requestId:r._id,decision:"approved",operationId:"leave-approve-"+crypto.randomUUID()}),"تم اعتماد الطلب.")}>اعتماد</button><button className="rounded-lg border px-4 py-2 text-sm" disabled={busy} onClick={()=>void run(()=>review({requestId:r._id,decision:"rejected",operationId:"leave-reject-"+crypto.randomUUID()}),"تم رفض الطلب.")}>رفض</button></div>}</article>})}</div></section>
 </div></main>;
}
