"use client";

import BackToDashboard from "@/components/BackToDashboard";import EnsureCentralAdminBootstrap from "../../../components/EnsureCentralAdminBootstrap";
import {useState} from "react";
import {useMutation,useQuery} from "convex/react";
import {api} from "../../../../convex/_generated/api";
import type {Id} from "../../../../convex/_generated/dataModel";
const field="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm";
const btn="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
export default function EmployeeActionsPage(){
 const data=useQuery(api.employeeActions.listEmployeeActions,{});
 const create=useMutation(api.employeeActions.createEmployeeAction),review=useMutation(api.employeeActions.reviewEmployeeAction);
 const [employeeId,setEmployeeId]=useState(""),[actionType,setActionType]=useState<"sanction"|"reward">("sanction"),[category,setCategory]=useState(""),[description,setDescription]=useState(""),[effectiveDate,setEffectiveDate]=useState(new Date().toISOString().slice(0,10)),[amount,setAmount]=useState("");
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 async function run(fn:()=>Promise<unknown>,ok:string){setBusy(true);setError("");setNotice("");try{await fn();setNotice(ok);}catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ العملية.");}finally{setBusy(false);}}
 return <main dir="rtl" className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-7"><EnsureCentralAdminBootstrap /><div className="mx-auto max-w-7xl space-y-6">
 <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold text-teal-700">DEMIX ERP / HR</p><h1 className="mt-2 text-2xl font-extrabold">الجزاءات والمكافآت</h1><p className="mt-2 text-sm text-slate-500">تسجيل الإجراءات ومراجعتها واعتمادها قبل ترحيل الأثر المالي إلى الرواتب.</p></div><BackToDashboard /></header>
 {notice&&<div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}{error&&<div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
 <section className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-bold">إضافة جزاء أو مكافأة</h2><div className="grid gap-3 sm:grid-cols-2">
 <label className="text-xs font-semibold">الموظف<select className={field} value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">اختر الموظف</option>{(data?.employees??[]).map(e=><option key={e._id} value={e._id}>{e.employeeNo} – {e.fullName}</option>)}</select></label>
 <label className="text-xs font-semibold">نوع الإجراء<select className={field} value={actionType} onChange={e=>setActionType(e.target.value as typeof actionType)}><option value="sanction">جزاء</option><option value="reward">مكافأة</option></select></label>
 <label className="text-xs font-semibold">التصنيف<input className={field} value={category} onChange={e=>setCategory(e.target.value)} placeholder="إنذار / خصم / مكافأة أداء"/></label>
 <label className="text-xs font-semibold">تاريخ السريان<input type="date" className={field} value={effectiveDate} onChange={e=>setEffectiveDate(e.target.value)}/></label>
 <label className="text-xs font-semibold">القيمة المالية (اختياري)<input type="number" min="0" step="0.01" className={field} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
 <label className="text-xs font-semibold sm:col-span-2">التفاصيل<textarea className={field} rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label></div>
 <button className={btn} disabled={busy||!employeeId||!category.trim()||!description.trim()} onClick={()=>void run(()=>create({employeeId:employeeId as Id<"employees">,actionType,category,description,effectiveDate,amount:amount?Number(amount):undefined,operationId:"hr-action-"+crypto.randomUUID()}),"تم تسجيل الإجراء بانتظار المراجعة.")}>تسجيل الإجراء</button></section>
 <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">سجل الجزاءات والمكافآت</h2><div className="mt-3 space-y-3">{(data?.actions??[]).map(a=>{const e=data?.employees.find(x=>x._id===a.employeeId);return <article key={a._id} className="rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{e?.employeeNo} – {e?.fullName} · {a.actionType==="sanction"?"جزاء":"مكافأة"}</strong><span className="text-xs">{a.status==="pending"?"قيد المراجعة":a.status==="approved"?"معتمد":"مرفوض"}</span></div><p className="mt-2 text-xs">{a.category} · {a.effectiveDate}{a.amount!==undefined?" · "+a.amount.toLocaleString("en")+" جنيه":""}</p><p className="mt-1 text-xs text-slate-600">{a.description}</p>{a.status==="pending"&&<div className="mt-3 flex gap-2"><button className={btn} disabled={busy} onClick={()=>void run(()=>review({actionId:a._id,decision:"approved",operationId:"hr-action-approve-"+crypto.randomUUID()}),"تم اعتماد الإجراء.")}>اعتماد</button><button className="rounded-lg border px-4 py-2 text-sm" disabled={busy} onClick={()=>void run(()=>review({actionId:a._id,decision:"rejected",operationId:"hr-action-reject-"+crypto.randomUUID()}),"تم رفض الإجراء.")}>رفض</button></div>}</article>})}</div></section>
 </div></main>;
}
