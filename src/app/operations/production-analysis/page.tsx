"use client";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import BackToDashboard from "@/components/BackToDashboard";

type Filters = { from: string; to: string; stationId: string; customer: string; project: string; mix: string; truck: string; driver: string; job: string; state: string };
const empty: Filters = { from: "", to: "", stationId: "", customer: "", project: "", mix: "", truck: "", driver: "", job: "", state: "" };
const rawValue = (raw: unknown, key: string) => {
  if (!raw || typeof raw !== "object") return "—";
  const value = (raw as Record<string, unknown>)[key];
  return value === null || value === undefined || value === "" ? "—" : String(value);
};
const options = (rows: any[] | undefined, key: keyof Filters) => Array.from(new Set((rows ?? []).map(r => {
  const value = key === "customer" ? r.customerName : key === "project" ? r.projectName : key === "mix" ? r.concreteGrade : key === "truck" ? r.truckNo : key === "driver" ? r.operatorName : key === "job" ? r.jobNo : r.operationState;
  return typeof value === "string" ? value.trim() : "";
}).filter(Boolean))).sort((a,b) => a.localeCompare(b, "ar"));
function FilterSelect({ label, value, onChange, values }: { label: string; value: string; onChange: (v: string) => void; values: string[] }) {
 return <label className="grid gap-1 text-xs font-semibold text-slate-600"><span>{label}</span><select className="min-w-0 rounded-lg border border-slate-300 bg-white p-2.5 text-sm font-normal text-slate-800" value={value} onChange={e=>onChange(e.target.value)}><option value="">الكل</option>{values.map(v=><option key={v} value={v}>{v}</option>)}</select></label>;
}
export default function ProductionAnalysisPage() {
 const [f,setF]=useState<Filters>(empty);
 const patch=(key:keyof Filters,value:string)=>setF(prev=>({...prev,[key]:value}));
 const invalid=Boolean(f.from&&f.to&&f.from>f.to);
 const fromAt=f.from?new Date(f.from+"T00:00:00+02:00").getTime():undefined;
 const toAt=f.to?new Date(f.to+"T23:59:59.999+02:00").getTime():undefined;
 const rows=useQuery(api.operations.listImportedProduction, invalid ? "skip" : {
  stationId:f.stationId ? f.stationId as any : undefined, fromAt,toAt,
  customerName:f.customer||undefined,projectName:f.project||undefined,jobNo:f.job||undefined,
  concreteGrade:f.mix||undefined,truckNo:f.truck||undefined,operatorName:f.driver||undefined,
  operationState:f.state||undefined,limit:1000,
 });
 const stations=useQuery(api.stations.listActiveStations,{});
 const reports=useQuery(api.stationSync.listReconciliationReports,{limit:5});
 const total=(rows??[]).reduce((sum:number,r:any)=>sum+(r.quantity??0),0);
 const daily=useMemo(()=>{
  const groups=new Map<string,{loads:number;volume:number}>();
  for(const r of rows??[]){const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(r.productionAt));const v=groups.get(day)??{loads:0,volume:0};v.loads++;v.volume+=r.quantity??0;groups.set(day,v);}
  return Array.from(groups.entries()).sort((a,b)=>b[0].localeCompare(a[0]));
 },[rows]);
 const reset=()=>setF(empty);
 return <main dir="rtl" className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-7"><div className="mx-auto max-w-[1600px] space-y-5">
  <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-teal-700">DEMIX ENTERPRISE ERP / OPERATIONS</p><h1 className="mt-1 text-2xl font-extrabold">تحليل إنتاج المحطات</h1><p className="mt-2 text-sm text-slate-600">وحدة تحليل مستقلة لبيانات الإنتاج المستوردة؛ لا تعدّل Access ولا تنشئ خصمًا مخزنيًا.</p></div><BackToDashboard/></header>
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">فلاتر البحث والتصفية</h2><button onClick={reset} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">إعادة ضبط الفلاتر</button></div>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
    <label className="grid gap-1 text-xs font-semibold text-slate-600">من تاريخ<input type="date" className="rounded-lg border p-2.5 text-sm font-normal" value={f.from} onChange={e=>patch("from",e.target.value)}/></label>
    <label className="grid gap-1 text-xs font-semibold text-slate-600">إلى تاريخ<input type="date" className="rounded-lg border p-2.5 text-sm font-normal" value={f.to} onChange={e=>patch("to",e.target.value)}/></label>
    <label className="grid gap-1 text-xs font-semibold text-slate-600">المحطة<select className="rounded-lg border p-2.5 text-sm font-normal" value={f.stationId} onChange={e=>patch("stationId",e.target.value)}><option value="">كل المحطات</option>{(stations??[]).map((s:any)=><option key={s._id} value={s._id}>{s.name} — {s.code}</option>)}</select></label>
    <FilterSelect label="العميل" value={f.customer} onChange={v=>patch("customer",v)} values={options(rows,"customer")}/>
    <FilterSelect label="المشروع" value={f.project} onChange={v=>patch("project",v)} values={options(rows,"project")}/>
    <FilterSelect label="الخلطة / الدرجة" value={f.mix} onChange={v=>patch("mix",v)} values={options(rows,"mix")}/>
    <FilterSelect label="رقم الخلاطة / السيارة" value={f.truck} onChange={v=>patch("truck",v)} values={options(rows,"truck")}/>
    <FilterSelect label="السائق / المشغل" value={f.driver} onChange={v=>patch("driver",v)} values={options(rows,"driver")}/>
    <FilterSelect label="رقم أمر التشغيل" value={f.job} onChange={v=>patch("job",v)} values={options(rows,"job")}/>
    <FilterSelect label="حالة التشغيل" value={f.state} onChange={v=>patch("state",v)} values={options(rows,"state")}/>
   </div>
   {invalid&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.</p>}
   <p className="mt-3 text-xs text-slate-500">تُطبق الفلاتر على آخر 1,000 سجل ضمن الفترة المحددة. اترك التاريخين فارغين لعرض أحدث السجلات.</p>
  </section>
  <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">عدد تشغيلات الصب</p><p className="mt-2 text-2xl font-extrabold">{rows?.length??"—"}</p></div><div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">إجمالي الإنتاج بالمتر المكعب</p><p className="mt-2 text-2xl font-extrabold">{rows?total.toLocaleString("en-US",{maximumFractionDigits:3}):"—"} م³</p></div><div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">عدد أيام الإنتاج</p><p className="mt-2 text-2xl font-extrabold">{rows?daily.length:"—"}</p></div></section>
  <section className="overflow-x-auto rounded-xl border bg-white p-4"><h2 className="mb-3 font-bold">الإنتاج اليومي</h2>{rows===undefined?<p className="p-3 text-sm text-slate-500">جارٍ تحميل بيانات الإنتاج أو التحقق من الصلاحية.</p>:<table className="w-full min-w-[520px] text-right text-sm"><thead className="bg-slate-50"><tr><th className="p-3">اليوم</th><th className="p-3">عدد التشغيلات</th><th className="p-3">الإنتاج م³</th></tr></thead><tbody>{daily.map(([day,v])=><tr key={day} className="border-t"><td className="p-3">{day}</td><td className="p-3">{v.loads}</td><td className="p-3 font-bold">{v.volume.toLocaleString("en-US",{maximumFractionDigits:3})}</td></tr>)}</tbody></table>}</section>
  <section className="overflow-x-auto rounded-xl border bg-white p-4"><h2 className="mb-3 font-bold">تفاصيل التشغيل والخامات كما وردت من المحطة</h2><p className="mb-3 text-xs text-amber-700">أعمدة GL وFL وWJ وShui تُعرض بأسمائها المصدرية دون افتراض معناها أو وحدة قياسها. الإضافتان الكيميائيتان معرفتان من NAM_WJA1 وNAM_WJA2، وكمياتهما من WJA1 وWJA2.</p>{rows===undefined?<p className="p-3 text-sm text-slate-500">جارٍ التحميل...</p>:<table className="w-full min-w-[1900px] text-right text-xs"><thead className="bg-slate-50"><tr>{["التاريخ والوقت","المحطة","العميل","المشروع","الخلطة","رقم أمر التشغيل","الإنتاج م³","رقم الخلاطة","السائق","GL","FL","WJ","Shui","Admix1","كمية 1","Admix2","كمية 2","الحالة","معرف المصدر"].map(x=><th key={x} className="whitespace-nowrap p-3">{x}</th>)}</tr></thead><tbody>{(rows as any[]).map(r=>{const raw=r.rawSourceData??{};return <tr key={r._id} className="border-t"><td className="whitespace-nowrap p-3">{new Intl.DateTimeFormat("ar-EG",{dateStyle:"short",timeStyle:"short"}).format(new Date(r.productionAt))}</td><td className="p-3">{r.station?.name??"—"}</td><td className="p-3">{r.customerName??"—"}</td><td className="p-3">{r.projectName??"—"}</td><td className="p-3">{r.concreteGrade??"—"}</td><td className="p-3">{r.jobNo??"—"}</td><td className="p-3 font-bold">{r.quantity??"—"}</td><td className="p-3">{r.truckNo??"—"}</td><td className="p-3">{r.operatorName??"—"}</td><td className="p-3">{rawValue(raw,"GL")}</td><td className="p-3">{rawValue(raw,"FL")}</td><td className="p-3">{rawValue(raw,"WJ")}</td><td className="p-3">{rawValue(raw,"Shui")}</td><td className="p-3">{rawValue(raw,"NAM_WJA1")}</td><td className="p-3">{rawValue(raw,"WJA1")}</td><td className="p-3">{rawValue(raw,"NAM_WJA2")}</td><td className="p-3">{rawValue(raw,"WJA2")}</td><td className="p-3">{r.operationState??"—"}</td><td className="p-3">{r.sourceRecordId}</td></tr>})}</tbody></table>}</section>
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">مطابقة بيانات DB.MDB مع DeMix</h2><p className="mt-1 text-xs text-slate-500">تُشغّل المقارنة من جهاز المحطة بقراءة Access فقط. لا يُرفع ملف DB.MDB؛ الذي يصل إلى Preview هو ملخص المطابقة ومعرفات السجلات غير المتطابقة فقط.</p></div><a href="https://raw.githubusercontent.com/DrHanyM/demix-enterprise-erp/feature/operations-modules/station-connector/connector.py" target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-xs font-bold text-teal-700">موصل المقارنة المحدّث</a></div>
   {reports===undefined?<p className="mt-4 text-sm text-slate-500">جارٍ تحميل تقارير المطابقة.</p>:reports.length===0?<p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">لم يُسجّل تقرير مقارنة بعد. بعد تشغيل أمر المقارنة من جهاز المحطة سيظهر التقرير هنا.</p>:<div className="mt-4 space-y-4">{reports.map((report:any)=><div key={report._id} className="rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><b>{report.station?.name??report.stationId} — {report.machineId}</b><span className="text-xs text-slate-500">{new Intl.DateTimeFormat("ar-EG",{dateStyle:"short",timeStyle:"short"}).format(new Date(report.comparedAt))}</span></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{[["سجلات الملف",report.sourceRecords],["سجلات DeMix",report.serverRecords],["متطابق",report.matched],["بالملف فقط",report.fileOnly],["في DeMix فقط",report.demixOnly],["اختلاف",report.different],["مكرر بالملف",report.duplicates]].map(([label,value])=><div key={String(label)} className="rounded bg-slate-50 p-2"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 text-lg font-extrabold tabular-nums">{Number(value).toLocaleString("en-US")}</div></div>)}</div>{report.details?.length>0&&<div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-right text-xs"><thead className="bg-slate-50"><tr><th className="p-2">الحالة</th><th className="p-2">معرف السجل</th><th className="p-2">بصمة الملف</th><th className="p-2">بصمة DeMix</th></tr></thead><tbody>{report.details.map((d:any,i:number)=><tr key={i} className="border-t"><td className="p-2">{({file_only:"بالملف فقط",demix_only:"في DeMix فقط",different:"اختلاف",duplicate:"مكرر"} as Record<string,string>)[d.status]??d.status}</td><td className="p-2">{d.sourceRecordId}</td><td className="p-2 font-mono">{d.sourceHash?.slice(0,14)??"—"}</td><td className="p-2 font-mono">{d.serverHash?.slice(0,14)??"—"}</td></tr>)}</tbody></table><p className="mt-2 text-[11px] text-slate-500">يعرض التقرير حتى 500 حالة تفصيلية؛ إجماليات المطابقة تشمل جميع السجلات.</p></div>}</div>)}</div>}
   <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600"><b>الأوامر على جهاز المحطة:</b><br/><code>python .\\connector.py --compare-preview</code> للمقارنة فقط، أو <code>python .\\connector.py --send-preview-next-100</code> لإرسال حتى 100 سجل غير موجود/معدّل في Preview. الأمران لا يكتبان في طابور SQLite ولا يرفعان ملف قاعدة البيانات.</div>
  </section>
  <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><b>ضوابط الوحدة:</b> البيانات للعرض والتحليل فقط. لا يتم تعديل ملف DB.MDB، ولا خصم خامات أو إنشاء حركة مخزنية تلقائيًا. ربط GL/FL/WJ/Shui بأسماء السن والرمل والأسمنت والمياه ووحدات القياس يظل معلقًا حتى مطابقة قاموس حقول المحطة الفعلي.</section>
 </div></main>;
}
