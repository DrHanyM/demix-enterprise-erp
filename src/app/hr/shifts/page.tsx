"use client";

import BackToDashboard from "@/components/BackToDashboard";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm";
const button = "rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export default function ShiftsPage() {
  const data = useQuery(api.shifts.listShiftSetup, {});
  const createShift = useMutation(api.shifts.createShift);
  const assignShift = useMutation(api.shifts.assignEmployeeShift);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [stationId, setStationId] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [breakMinutes, setBreakMinutes] = useState("60");
  const [graceMinutes, setGraceMinutes] = useState("15");
  const [weeklyDays, setWeeklyDays] = useState<number[]>([0,1,2,3,4]);
  const [employeeId, setEmployeeId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0,10));
  const [effectiveTo, setEffectiveTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const companies = useMemo(() => {
    const seen = new Map<string,string>();
    for (const e of data?.employees ?? []) seen.set(e.companyId, e.companyName);
    for (const s of data?.shifts ?? []) seen.set(s.companyId, s.companyName);
    return [...seen.entries()].map(([id,name])=>({id,name}));
  }, [data]);
  const stations = useMemo(() => {
    const seen = new Map<string,string>();
    for (const e of data?.employees ?? []) if(e.stationId) seen.set(e.stationId,e.stationName);
    for (const s of data?.shifts ?? []) if(s.stationId) seen.set(s.stationId,s.stationName);
    return [...seen.entries()].map(([id,name])=>({id,name}));
  }, [data]);
  function toggleDay(day:number) {
    setWeeklyDays(current => current.includes(day) ? current.filter(x=>x!==day) : [...current,day].sort());
  }
  async function run(action:()=>Promise<unknown>, message:string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(message); }
    catch(e) { setError(e instanceof Error ? e.message : "تعذر تنفيذ العملية."); }
    finally { setBusy(false); }
  }
  return <main dir="rtl" className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-7">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold text-teal-700">DEMIX ERP / HR</p><h1 className="mt-2 text-2xl font-extrabold">الورديات والجداول</h1>
        <p className="mt-2 text-sm text-slate-500">تعريف الورديات وتحديد أيام العمل وفترات سريان تكليف كل موظف.</p></div>
        <BackToDashboard />
      </header>
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      <section className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold">تعريف وردية جديدة</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold">كود الوردية<input className={input} value={code} onChange={e=>setCode(e.target.value)} placeholder="SH-01"/></label>
            <label className="space-y-1 text-xs font-semibold">اسم الوردية<input className={input} value={name} onChange={e=>setName(e.target.value)} placeholder="الوردية الصباحية"/></label>
            <label className="space-y-1 text-xs font-semibold">الشركة<select className={input} value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">اختر الشركة</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="space-y-1 text-xs font-semibold">المحطة (اختياري)<select className={input} value={stationId} onChange={e=>setStationId(e.target.value)}><option value="">كل محطات الشركة</option>{stations.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="space-y-1 text-xs font-semibold">من الساعة<input className={input} type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label>
            <label className="space-y-1 text-xs font-semibold">إلى الساعة<input className={input} type="time" value={endTime} onChange={e=>setEndTime(e.target.value)}/></label>
            <label className="space-y-1 text-xs font-semibold">الراحة بالدقائق<input className={input} type="number" min="0" max="360" value={breakMinutes} onChange={e=>setBreakMinutes(e.target.value)}/></label>
            <label className="space-y-1 text-xs font-semibold">السماح بالتأخير بالدقائق<input className={input} type="number" min="0" max="180" value={graceMinutes} onChange={e=>setGraceMinutes(e.target.value)}/></label>
          </div>
          <div><p className="mb-2 text-xs font-semibold">أيام العمل الأسبوعية</p><div className="flex flex-wrap gap-2">{dayNames.map((d,i)=><label key={d} className="flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs"><input type="checkbox" checked={weeklyDays.includes(i)} onChange={()=>toggleDay(i)}/>{d}</label>)}</div></div>
          <button className={button} disabled={busy || !code.trim() || !name.trim() || !companyId} onClick={()=>void run(()=>createShift({code,name,companyId:companyId as Id<"companies">,stationId:stationId ? stationId as Id<"stations"> : undefined,startTime,endTime,breakMinutes:Number(breakMinutes),graceMinutes:Number(graceMinutes),weeklyDays,operationId:"shift-create-"+crypto.randomUUID()}),"تم إنشاء الوردية.")}>حفظ الوردية</button>
        </div>
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold">إسناد وردية إلى موظف</h2>
          <label className="block space-y-1 text-xs font-semibold">الموظف<select className={input} value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">اختر الموظف</option>{(data?.employees ?? []).map(e=><option key={e._id} value={e._id}>{e.employeeNo} – {e.fullName} ({e.stationName})</option>)}</select></label>
          <label className="block space-y-1 text-xs font-semibold">الوردية<select className={input} value={shiftId} onChange={e=>setShiftId(e.target.value)}><option value="">اختر الوردية</option>{(data?.shifts ?? []).filter(s=>s.status==="active").map(s=><option key={s._id} value={s._id}>{s.code} – {s.name} ({s.startTime}–{s.endTime})</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold">ساري من<input className={input} type="date" value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)}/></label>
            <label className="space-y-1 text-xs font-semibold">حتى تاريخ (اختياري)<input className={input} type="date" value={effectiveTo} onChange={e=>setEffectiveTo(e.target.value)}/></label>
          </div>
          <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">يمنع النظام تداخل فترات إسناد الورديات للموظف نفسه، ويتحقق من توافق الشركة والمحطة قبل الحفظ.</p>
          <button className={button} disabled={busy || !employeeId || !shiftId || !effectiveFrom} onClick={()=>void run(()=>assignShift({employeeId:employeeId as Id<"employees">,shiftId:shiftId as Id<"shifts">,effectiveFrom,effectiveTo:effectiveTo || undefined,operationId:"shift-assign-"+crypto.randomUUID()}),"تم إسناد الوردية للموظف.")}>اعتماد الإسناد</button>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold">الورديات المسجلة</h2>
        {!data ? <p className="mt-4 text-sm text-slate-500">جارٍ تحميل البيانات...</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-right text-xs"><thead className="bg-slate-100 text-slate-600"><tr>{["الكود","الوردية","الشركة","المحطة","الوقت","الراحة","السماح","أيام العمل","الحالة"].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{data.shifts.map(s=><tr key={s._id} className="border-t"><td className="p-3">{s.code}</td><td className="p-3 font-semibold">{s.name}</td><td className="p-3">{s.companyName}</td><td className="p-3">{s.stationName}</td><td className="p-3" dir="ltr">{s.startTime} – {s.endTime}</td><td className="p-3">{s.breakMinutes} د</td><td className="p-3">{s.graceMinutes} د</td><td className="p-3">{s.weeklyDays.map(d=>dayNames[d]).join("، ")}</td><td className="p-3">{s.status==="active"?"نشطة":"موقوفة"}</td></tr>)}</tbody></table></div>}</section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">آخر إسنادات الورديات</h2><div className="mt-3 space-y-2 text-xs">{(data?.assignments ?? []).slice(0,30).map(a=>{const employee=data?.employees.find(e=>e._id===a.employeeId);const shift=data?.shifts.find(s=>s._id===a.shiftId);return <div key={a._id} className="flex flex-wrap justify-between gap-2 border-b py-2"><span>{employee?.fullName ?? "موظف غير نشط"} · {shift?.name ?? "وردية"}</span><span>{a.effectiveFrom} {a.effectiveTo ? "– "+a.effectiveTo : "– مستمر"}</span></div>})}</div></section>
    </div>
  </main>;
}
