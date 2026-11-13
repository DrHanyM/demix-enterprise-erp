"use client";
import { useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import BackToDashboard from "@/components/BackToDashboard";

type Row={_id:string;sourceRecordId:string;productionAt:number;quantity?:number;customerName?:string;projectName?:string;jobNo?:string;concreteGrade?:string;operatorName?:string;driverName?:string;truckNo?:string;operationState?:string;station?:{name:string;code:string}|null;rawSourceData?:Record<string,unknown>};
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
const dayOf=(ms:number)=>{const d=new Date(ms);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
const raw=(r:Row,key:string):unknown=>{const o=r.rawSourceData??{},k=Object.keys(o).find(x=>x.toLowerCase()===key.toLowerCase());return k?o[k]:undefined};
const show=(v:unknown)=>v===null||v===undefined||String(v).trim()===""?"—":String(v);
const num=(v:unknown)=>{if(typeof v==="number"&&Number.isFinite(v))return v;const n=Number(String(v??"").replace(/,/g,"").trim());return Number.isFinite(n)?n:0};
const norm=(v:unknown)=>String(v??"").trim().replace(/\s+/g," ").toLocaleLowerCase();
function materialSummary(rows:Row[]){
 const groups=[
  {id:"aggregate",label:"السن / الركام",keys:Array.from({length:8},(_,i)=>"GL"+(i+1))},
  {id:"sand",label:"الرمل",keys:Array.from({length:8},(_,i)=>"GL"+(i+1))},
  {id:"unknown",label:"خانات GL غير المصنفة",keys:Array.from({length:8},(_,i)=>"GL"+(i+1))},
  {id:"cement",label:"الأسمنت",keys:["FLA1","FLA2","FLA3","FLA4","FLB1","FLB2","FLB3","FLC1","FLC2"]},
  {id:"water",label:"المياه",keys:["Shui1","Shui2"]},
  {id:"admixture",label:"الإضافات الكيميائية",keys:["WJA1","WJA2","WJA3","WJA4","WJB1","WJB2","WJB3","WJB4","WJC1","WJC2","WJC3","WJC4"]},
 ];
 return groups.map(g=>{
  const slots=new Map<string,{name:string;expected:number;actual:number}>();
  for(const r of rows)for(const key of g.keys){
   const name=show(raw(r,"NAM_"+key)),hasValues=num(raw(r,"MBZ_"+key))!==0||num(raw(r,"CLZ_"+key))!==0;
   if(name==="—"&&!hasValues)continue;
   const isSand=/sand|رمل/i.test(name),isAgg=/agg|سن|ركام/i.test(name);
   if(g.id==="sand"&&!isSand)continue;
   if(g.id==="aggregate"&&!isAgg)continue;
   if(g.id==="unknown"&&(isSand||isAgg))continue;
   const label=key==="WJA1"?"Admix1":key==="WJA2"?"Admix2":name==="—"?key:name;
   const v=slots.get(key)??{name:label,expected:0,actual:0};
   v.expected+=num(raw(r,"MBZ_"+key));v.actual+=num(raw(r,"CLZ_"+key));
   if(v.name===key&&label!==key)v.name=label;
   slots.set(key,v);
  }
  return {...g,items:[...slots.entries()].map(([key,v])=>({key,...v}))};
 });
}
function saveFile(filename:string,content:string,type:string){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}
export default function ProductionAnalysisPage(){
 const [from,setFrom]=useState(today),[to,setTo]=useState(today),[fromTime,setFromTime]=useState(""),[toTime,setToTime]=useState("");
 const [stationId,setStationId]=useState(""),[customer,setCustomer]=useState(""),[project,setProject]=useState(""),[mix,setMix]=useState("");
 const [mixer,setMixer]=useState(""),[driver,setDriver]=useState(""),[job,setJob]=useState(""),[state,setState]=useState(""),[search,setSearch]=useState("");
 const invalid=Boolean(from&&to&&from>to),fromAt=from?new Date(from+"T00:00:00").getTime():undefined,toAt=to?new Date(to+"T23:59:59.999").getTime():undefined;
 const stations=useQuery(api.stations.listActiveStations,{});
 const args=invalid?"skip":{stationId:stationId?(stationId as any):undefined,fromAt,toAt};
 const {results,status,loadMore}=usePaginatedQuery(api.operations.listImportedProductionPage,args,{initialNumItems:500});
 const rows=(results??[]) as unknown as Row[];
 const opts=useMemo(()=>({
  customers:[...new Set(rows.map(r=>r.customerName).filter(Boolean) as string[])].sort(),
  projects:[...new Set(rows.map(r=>r.projectName).filter(Boolean) as string[])].sort(),
  mixes:[...new Set(rows.map(r=>r.concreteGrade).filter(Boolean) as string[])].sort(),
  mixers:[...new Set(rows.map(r=>show(r.truckNo??raw(r,"Truck_No"))).filter(x=>x!=="—"))].sort(),
  drivers:[...new Set(rows.map(r=>show(r.driverName??raw(r,"Driver"))).filter(x=>x!=="—"))].sort(),
  jobs:[...new Set(rows.map(r=>show(r.jobNo??raw(r,"Job_No"))).filter(x=>x!=="—"))].sort(),
  states:[...new Set(rows.map(r=>show(r.operationState??raw(r,"OperationState"))).filter(x=>x!=="—"))].sort(),
 }),[rows]);
 const filtered=useMemo(()=>rows.filter(r=>{
  const d=new Date(r.productionAt),t=String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
  return (!fromTime||t>=fromTime)&&(!toTime||t<=toTime)&&(!customer||norm(r.customerName)===norm(customer))&&(!project||norm(r.projectName)===norm(project))
   &&(!mix||norm(r.concreteGrade)===norm(mix))&&(!mixer||norm(r.truckNo??raw(r,"Truck_No"))===norm(mixer))
   &&(!driver||norm(r.driverName??raw(r,"Driver"))===norm(driver))&&(!job||norm(r.jobNo??raw(r,"Job_No"))===norm(job))
   &&(!state||norm(r.operationState??raw(r,"OperationState"))===norm(state))
   &&(!search||[r.sourceRecordId,r.jobNo,r.customerName,r.projectName,r.concreteGrade,r.truckNo,r.driverName,r.operatorName].some(v=>norm(v).includes(norm(search))));
 }),[rows,fromTime,toTime,customer,project,mix,mixer,driver,job,state,search]);
 const total=filtered.reduce((s,r)=>s+(r.quantity??0),0),todayTotal=filtered.filter(r=>dayOf(r.productionAt)===today()).reduce((s,r)=>s+(r.quantity??0),0);
 const materials=useMemo(()=>materialSummary(filtered),[filtered]);
 const daily=useMemo(()=>{const m=new Map<string,{qty:number;count:number;customers:Set<string>}>();for(const r of filtered){const d=dayOf(r.productionAt),v=m.get(d)??{qty:0,count:0,customers:new Set<string>()};v.qty+=r.quantity??0;v.count++;if(r.customerName)v.customers.add(r.customerName);m.set(d,v)}return [...m.entries()].sort((a,b)=>b[0].localeCompare(a[0]))},[filtered]);
 const exhausted=status==="Exhausted";
 const reset=()=>{setFrom("");setTo("");setFromTime("");setToTime("");setStationId("");setCustomer("");setProject("");setMix("");setMixer("");setDriver("");setJob("");setState("");setSearch("")};
 const exportJson=()=>saveFile("demix-production-comparison.json",JSON.stringify({source:"DeMix Convex station imports",exportedAt:new Date().toISOString(),records:rows.map(r=>({sourceRecordId:r.sourceRecordId,stationCode:r.station?.code??"",rawSourceData:r.rawSourceData??{}}))},null,2),"application/json;charset=utf-8");
 const exportCsv=()=>{const cols=["sourceRecordId","productionAt","station","jobNo","customerName","projectName","concreteGrade","quantity","truckNo","driverName","operatorName","operationState"];const esc=(v:unknown)=>'"'+String(v??"").replace(/"/g,'""')+'"';const lines=[cols.join(","),...filtered.map(r=>cols.map(c=>esc(c==="station"?r.station?.name:(r as any)[c])).join(","))];saveFile("demix-production-filtered.csv","\ufeff"+lines.join("\r\n"),"text/csv;charset=utf-8")};
 return <main dir="rtl" className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-7"><div className="mx-auto max-w-[1500px] space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-teal-700">DEMIX ENTERPRISE ERP</p><h1 className="mt-1 text-2xl font-extrabold">تحليل إنتاج المحطات ومطابقة البيانات</h1><p className="mt-1 text-sm text-slate-500">قراءة فقط لسجلات المحطات المستوردة — لا تعديل للمصدر ولا خصم مخزني تلقائي.</p></div><BackToDashboard/></div>
  <section className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4 xl:grid-cols-6">
   <label className="text-xs text-slate-600">من تاريخ<input type="date" className="mt-1 block w-full rounded-lg border p-2 text-sm" value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label className="text-xs text-slate-600">إلى تاريخ<input type="date" className="mt-1 block w-full rounded-lg border p-2 text-sm" value={to} onChange={e=>setTo(e.target.value)}/></label>
   <label className="text-xs text-slate-600">من ساعة<input type="time" className="mt-1 block w-full rounded-lg border p-2 text-sm" value={fromTime} onChange={e=>setFromTime(e.target.value)}/></label>
   <label className="text-xs text-slate-600">إلى ساعة<input type="time" className="mt-1 block w-full rounded-lg border p-2 text-sm" value={toTime} onChange={e=>setToTime(e.target.value)}/></label>
   <label className="text-xs text-slate-600">المحطة<select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={stationId} onChange={e=>setStationId(e.target.value)}><option value="">كل المحطات</option>{(stations??[]).map(s=><option key={s._id} value={s._id}>{s.name} — {s.code}</option>)}</select></label>
   <label className="text-xs text-slate-600">العميل<select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={customer} onChange={e=>setCustomer(e.target.value)}><option value="">كل العملاء</option>{opts.customers.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="text-xs text-slate-600">المشروع<select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={project} onChange={e=>setProject(e.target.value)}><option value="">كل المشروعات</option>{opts.projects.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="text-xs text-slate-600">الخلطة / درجة الإجهاد<select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={mix} onChange={e=>setMix(e.target.value)}><option value="">كل الخلطات</option>{opts.mixes.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="text-xs text-slate-600">رقم الخلاطة<select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={mixer} onChange={e=>setMixer(e.target.value)}><option value="">كل الخلاطات</option>{opts.mixers.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="text-xs text-slate-600">السائق<select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={driver} onChange={e=>setDriver(e.target.value)}><option value="">كل السائقين</option>{opts.drivers.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="text-xs text-slate-600">رقم التشغيلة<select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={job} onChange={e=>setJob(e.target.value)}><option value="">كل التشغيلات</option>{opts.jobs.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="text-xs text-slate-600">حالة التشغيل<select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={state} onChange={e=>setState(e.target.value)}><option value="">كل الحالات</option>{opts.states.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="text-xs text-slate-600 xl:col-span-2">بحث عام<input className="mt-1 block w-full rounded-lg border p-2 text-sm" placeholder="ID أو العميل أو المشروع أو الخلطة..." value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <div className="flex items-end gap-2"><button onClick={reset} className="rounded-lg border px-4 py-2 text-sm font-bold">إعادة ضبط</button><button onClick={exportCsv} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white">تصدير CSV</button></div>
  </section>
  {invalid&&<p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.</p>}
  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">إنتاج اليوم ضمن الفلاتر (م³)</p><p className="mt-2 text-2xl font-extrabold">{todayTotal.toLocaleString("en-US",{maximumFractionDigits:2})}</p></div>
   <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">إجمالي الكمية المفلترة (م³)</p><p className="mt-2 text-2xl font-extrabold">{total.toLocaleString("en-US",{maximumFractionDigits:2})}</p></div>
   <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">عدد التشغيلات المحملة</p><p className="mt-2 text-2xl font-extrabold">{filtered.length.toLocaleString("en-US")}</p></div>
   <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">متوسط التشغيلة (م³)</p><p className="mt-2 text-2xl font-extrabold">{(filtered.length?total/filtered.length:0).toLocaleString("en-US",{maximumFractionDigits:2})}</p></div>
  </section>
  <section className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">الخامات والإضافات — المتوقع مقابل الفعلي</h2><span className="text-xs text-slate-500">MBZ = المتوقع · CLZ = الفعلي وفق عناوين ملف المصدر</span></div><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{materials.map(g=><div key={g.id} className="rounded-lg border p-3"><h3 className="font-bold">{g.label}</h3>{g.items.length?<div className="mt-2 space-y-2">{g.items.map(m=><div key={m.key} className="border-t pt-2 text-xs"><p className="font-semibold">{m.name}</p><p className="mt-1 text-slate-500">متوقع: {m.expected.toLocaleString("en-US")} | فعلي: {m.actual.toLocaleString("en-US")}</p><p className="text-slate-400">فرق: {(m.actual-m.expected).toLocaleString("en-US")}</p></div>)}</div>:<p className="mt-2 text-xs text-slate-400">لا توجد قيم ضمن النتائج المحملة.</p>}</div>)}</div></section>
  <section className="overflow-x-auto rounded-xl border bg-white p-4"><h2 className="mb-3 font-bold">ملخص الإنتاج اليومي</h2><table className="w-full min-w-[600px] text-right text-sm"><thead className="bg-slate-50"><tr>{["التاريخ","الإنتاج م³","عدد التشغيلات","عدد العملاء"].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{daily.map(([d,v])=><tr key={d} className="border-t"><td className="p-3">{d}</td><td className="p-3 font-bold">{v.qty.toLocaleString("en-US",{maximumFractionDigits:2})}</td><td className="p-3">{v.count}</td><td className="p-3">{v.customers.size}</td></tr>)}</tbody></table></section>
  <section className="overflow-x-auto rounded-xl border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">تفاصيل التشغيلات</h2><span className="text-xs text-slate-500">تم تحميل {rows.length.toLocaleString("en-US")} سجلًا — {exhausted?"كل نتائج الفترة محملة":"حمّل المزيد لاستكمال النتائج"}</span></div><table className="mt-3 w-full min-w-[1250px] text-right text-sm"><thead className="bg-slate-50"><tr>{["التاريخ والوقت","المحطة","ID المصدر","رقم التشغيلة","العميل","المشروع","الخلطة","الإنتاج م³","رقم الخلاطة","السائق","المشغل","الحالة","بيانات المصدر"].map(x=><th key={x} className="whitespace-nowrap p-3">{x}</th>)}</tr></thead><tbody>{filtered.map(r=><tr key={r._id} className="border-t"><td className="whitespace-nowrap p-3">{new Date(r.productionAt).toLocaleString("ar-EG")}</td><td className="p-3">{r.station?.name??"—"}<div className="text-xs text-slate-400">{r.station?.code}</div></td><td className="p-3">{r.sourceRecordId}</td><td className="p-3">{r.jobNo??show(raw(r,"Job_No"))}</td><td className="p-3">{r.customerName??"—"}</td><td className="p-3">{r.projectName??"—"}</td><td className="p-3">{r.concreteGrade??"—"}</td><td className="p-3 font-bold">{r.quantity??"—"}</td><td className="p-3">{r.truckNo??show(raw(r,"Truck_No"))}</td><td className="p-3">{r.driverName??show(raw(r,"Driver"))}</td><td className="p-3">{r.operatorName??"—"}</td><td className="p-3">{r.operationState??show(raw(r,"OperationState"))}</td><td className="p-3"><details><summary className="cursor-pointer text-teal-700">عرض كل الحقول</summary><pre className="mt-2 max-w-[550px] overflow-auto whitespace-pre-wrap text-[10px]">{JSON.stringify(r.rawSourceData??{},null,2)}</pre></details></td></tr>)}</tbody></table>
   {status==="CanLoadMore"&&<div className="mt-4 text-center"><button onClick={()=>loadMore(500)} className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-bold text-white">تحميل 500 سجل إضافي</button></div>}{status==="LoadingMore"&&<p className="mt-3 text-center text-sm text-slate-500">جارٍ تحميل المزيد...</p>}{status==="LoadingFirstPage"&&<p className="mt-3 text-center text-sm text-slate-500">جارٍ تحميل الإنتاج...</p>}
  </section>
  <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-sky-950"><h2 className="font-bold">المقارنة اليدوية مع DB.MDB — محليًا فقط</h2><p>بعد تحميل كل صفحات النتائج، نزّل JSON لسجلات DeMix. أداة المقارنة المحلية تختار DB.MDB من جهازك وتقرأه Read Only؛ لا يتم رفع ملف Access إلى Vercel أو Convex.</p><button onClick={exportJson} disabled={!exhausted||!rows.length} className="mt-3 rounded-lg bg-sky-800 px-4 py-2 font-bold text-white disabled:opacity-40">تنزيل بيانات DeMix للمقارنة JSON</button></section>
  <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">NAM_WJA1 = Admix1 وNAM_WJA2 = Admix2 حسب الاتفاق. لم أفترض معنى NAM_WJA3 أو أي خانة غير معتمدة. الأعمدة الأخرى محفوظة كما وردت من المصدر. لا يوجد خصم مخزني تلقائي.</p>
 </div></main>;
}
