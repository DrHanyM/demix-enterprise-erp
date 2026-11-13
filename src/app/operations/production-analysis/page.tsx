"use client";

import { useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import BackToDashboard from "@/components/BackToDashboard";

type Row = {
  _id: string;
  sourceRecordId: string;
  productionAt: number;
  quantity?: number;
  customerName?: string;
  projectName?: string;
  jobNo?: string;
  concreteGrade?: string;
  operatorName?: string;
  driverName?: string;
  truckNo?: string;
  operationState?: string;
  station?: { name: string; code: string } | null;
  rawSourceData?: Record<string, unknown>;
};

const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
};
const dayOf = (ms: number) => {
  const d = new Date(ms);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
};
const raw = (r: Row, key: string): unknown => {
  const source = r.rawSourceData ?? {};
  const actualKey = Object.keys(source).find((x) => x.toLowerCase() === key.toLowerCase());
  return actualKey ? source[actualKey] : undefined;
};
const show = (value: unknown) => value === null || value === undefined || String(value).trim() === "" ? "—" : String(value);
const num = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
};
const norm = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

function materialSummary(rows: Row[]) {
  const groups = [
    { id: "aggregate", label: "السن / الركام", keys: Array.from({ length: 8 }, (_, i) => "GL" + (i + 1)) },
    { id: "sand", label: "الرمل", keys: Array.from({ length: 8 }, (_, i) => "GL" + (i + 1)) },
    { id: "unknown", label: "خانات GL غير المصنفة", keys: Array.from({ length: 8 }, (_, i) => "GL" + (i + 1)) },
    { id: "cement", label: "الأسمنت", keys: ["FLA1", "FLA2", "FLA3", "FLA4", "FLB1", "FLB2", "FLB3", "FLC1", "FLC2"] },
    { id: "water", label: "المياه", keys: ["Shui1", "Shui2"] },
    { id: "admixture", label: "الإضافات الكيميائية", keys: ["WJA1", "WJA2", "WJA3", "WJA4", "WJB1", "WJB2", "WJB3", "WJB4", "WJC1", "WJC2", "WJC3", "WJC4"] },
  ];

  return groups.map((group) => {
    const slots = new Map<string, { name: string; expected: number; actual: number }>();
    for (const row of rows) {
      for (const key of group.keys) {
        const name = show(raw(row, "NAM_" + key));
        const hasValues = num(raw(row, "MBZ_" + key)) !== 0 || num(raw(row, "CLZ_" + key)) !== 0;
        if (name === "—" && !hasValues) continue;

        const isSand = /sand|رمل/i.test(name);
        const isAggregate = /agg|سن|ركام/i.test(name);
        if (group.id === "sand" && !isSand) continue;
        if (group.id === "aggregate" && !isAggregate) continue;
        if (group.id === "unknown" && (isSand || isAggregate)) continue;

        const label = key === "WJA1" ? "Admix1" : key === "WJA2" ? "Admix2" : name === "—" ? key : name;
        const value = slots.get(key) ?? { name: label, expected: 0, actual: 0 };
        value.expected += num(raw(row, "MBZ_" + key));
        value.actual += num(raw(row, "CLZ_" + key));
        if (value.name === key && label !== key) value.name = label;
        slots.set(key, value);
      }
    }
    return { ...group, items: [...slots.entries()].map(([key, value]) => ({ key, ...value })) };
  });
}

function saveFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ProductionAnalysisPage() {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [stationId, setStationId] = useState("");
  const [customer, setCustomer] = useState("");
  const [project, setProject] = useState("");
  const [mix, setMix] = useState("");
  const [mixer, setMixer] = useState("");
  const [driver, setDriver] = useState("");
  const [job, setJob] = useState("");
  const [state, setState] = useState("");
  const [search, setSearch] = useState("");

  const invalid = Boolean(from && to && from > to);
  const fromAt = from ? new Date(from + "T00:00:00").getTime() : undefined;
  const toAt = to ? new Date(to + "T23:59:59.999").getTime() : undefined;
  const stations = useQuery(api.stations.listActiveStations, {});
  const args = invalid ? "skip" : {
    stationId: stationId ? stationId as any : undefined,
    fromAt,
    toAt,
    customerName: customer || undefined,
    projectName: project || undefined,
    jobNo: job || undefined,
    concreteGrade: mix || undefined,
    truckNo: mixer || undefined,
    driverName: driver || undefined,
    operationState: state || undefined,
  };
  const { results, status, loadMore } = usePaginatedQuery(api.operations.listImportedProductionPage, args, { initialNumItems: 500 });
  const rows = (results ?? []) as unknown as Row[];

  const options = useMemo(() => ({
    customers: [...new Set(rows.map((r) => r.customerName).filter(Boolean) as string[])].sort(),
    projects: [...new Set(rows.map((r) => r.projectName).filter(Boolean) as string[])].sort(),
    mixes: [...new Set(rows.map((r) => r.concreteGrade).filter(Boolean) as string[])].sort(),
    mixers: [...new Set(rows.map((r) => show(r.truckNo ?? raw(r, "Truck_No"))).filter((x) => x !== "—"))].sort(),
    drivers: [...new Set(rows.map((r) => show(r.driverName ?? r.operatorName ?? raw(r, "Driver"))).filter((x) => x !== "—"))].sort(),
    jobs: [...new Set(rows.map((r) => show(r.jobNo ?? raw(r, "Job_No"))).filter((x) => x !== "—"))].sort(),
    states: [...new Set(rows.map((r) => show(r.operationState ?? raw(r, "OperationState"))).filter((x) => x !== "—"))].sort(),
  }), [rows]);

  const filtered = useMemo(() => rows.filter((row) => {
    const date = new Date(row.productionAt);
    const time = String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
    const driverValue = row.driverName ?? row.operatorName ?? raw(row, "Driver");
    return (!fromTime || time >= fromTime)
      && (!toTime || time <= toTime)
      && (!customer || norm(row.customerName) === norm(customer))
      && (!project || norm(row.projectName) === norm(project))
      && (!mix || norm(row.concreteGrade) === norm(mix))
      && (!mixer || norm(row.truckNo ?? raw(row, "Truck_No")) === norm(mixer))
      && (!driver || norm(driverValue) === norm(driver))
      && (!job || norm(row.jobNo ?? raw(row, "Job_No")) === norm(job))
      && (!state || norm(row.operationState ?? raw(row, "OperationState")) === norm(state))
      && (!search || [row.sourceRecordId, row.jobNo, row.customerName, row.projectName, row.concreteGrade, row.truckNo, driverValue, row.operatorName].some((value) => norm(value).includes(norm(search))));
  }), [rows, fromTime, toTime, customer, project, mix, mixer, driver, job, state, search]);

  const total = filtered.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
  const todayTotal = filtered.filter((row) => dayOf(row.productionAt) === today()).reduce((sum, row) => sum + (row.quantity ?? 0), 0);
  const materials = useMemo(() => materialSummary(filtered), [filtered]);
  const daily = useMemo(() => {
    const groups = new Map<string, { qty: number; count: number; customers: Set<string> }>();
    for (const row of filtered) {
      const day = dayOf(row.productionAt);
      const value = groups.get(day) ?? { qty: 0, count: 0, customers: new Set<string>() };
      value.qty += row.quantity ?? 0;
      value.count += 1;
      if (row.customerName) value.customers.add(row.customerName);
      groups.set(day, value);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const exhausted = status === "Exhausted";
  const exportComplete = exhausted && !from && !to && !fromTime && !toTime && !customer && !project && !mix && !mixer && !driver && !job && !state && !search;
  const reset = () => {
    setFrom(""); setTo(""); setFromTime(""); setToTime(""); setStationId("");
    setCustomer(""); setProject(""); setMix(""); setMixer(""); setDriver(""); setJob(""); setState(""); setSearch("");
  };
  const exportJson = () => {
    const payload = {
      source: "DeMix Convex station imports",
      exportedAt: new Date().toISOString(),
      records: rows.map((row) => ({
        sourceRecordId: row.sourceRecordId,
        stationCode: row.station?.code ?? "",
        rawSourceData: row.rawSourceData ?? {},
      })),
    };
    saveFile("demix-production-comparison.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  };
  const exportCsv = () => {
    const columns = ["sourceRecordId", "productionAt", "station", "jobNo", "customerName", "projectName", "concreteGrade", "quantity", "truckNo", "driverName", "operatorName", "operationState"];
    const escapeCsv = (value: unknown) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const lines = [columns.join(","), ...filtered.map((row) => columns.map((column) => escapeCsv(column === "station" ? row.station?.name : (row as any)[column])).join(","))];
    saveFile("demix-production-filtered.csv", "\ufeff" + lines.join("\r\n"), "text/csv;charset=utf-8");
  };

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-7">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-teal-700">DEMIX ENTERPRISE ERP</p>
            <h1 className="mt-1 text-2xl font-extrabold">تحليل إنتاج المحطات ومطابقة البيانات</h1>
            <p className="mt-1 text-sm text-slate-500">قراءة فقط لسجلات المحطات المستوردة — لا تعديل للمصدر ولا خصم مخزني تلقائي.</p>
          </div>
          <BackToDashboard />
        </div>

        <section className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4 xl:grid-cols-6">
          <label className="text-xs text-slate-600">من تاريخ<input type="date" className="mt-1 block w-full rounded-lg border p-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs text-slate-600">إلى تاريخ<input type="date" className="mt-1 block w-full rounded-lg border p-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="text-xs text-slate-600">من ساعة<input type="time" className="mt-1 block w-full rounded-lg border p-2 text-sm" value={fromTime} onChange={(e) => setFromTime(e.target.value)} /></label>
          <label className="text-xs text-slate-600">إلى ساعة<input type="time" className="mt-1 block w-full rounded-lg border p-2 text-sm" value={toTime} onChange={(e) => setToTime(e.target.value)} /></label>
          <label className="text-xs text-slate-600">المحطة
            <select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={stationId} onChange={(e) => setStationId(e.target.value)}>
              <option value="">كل المحطات</option>
              {(stations ?? []).map((station) => <option key={station._id} value={station._id}>{station.name} — {station.code}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">العميل
            <select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="">كل العملاء</option>
              {options.customers.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">المشروع
            <select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">كل المشروعات</option>
              {options.projects.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">الخلطة / درجة الإجهاد
            <select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={mix} onChange={(e) => setMix(e.target.value)}>
              <option value="">كل الخلطات</option>
              {options.mixes.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">رقم الخلاطة
            <select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={mixer} onChange={(e) => setMixer(e.target.value)}>
              <option value="">كل الخلاطات</option>
              {options.mixers.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">السائق
            <select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={driver} onChange={(e) => setDriver(e.target.value)}>
              <option value="">كل السائقين</option>
              {options.drivers.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">رقم التشغيلة
            <select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={job} onChange={(e) => setJob(e.target.value)}>
              <option value="">كل التشغيلات</option>
              {options.jobs.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">حالة التشغيل
            <select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">كل الحالات</option>
              {options.states.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600 xl:col-span-2">بحث عام
            <input className="mt-1 block w-full rounded-lg border p-2 text-sm" placeholder="ID أو العميل أو المشروع أو الخلطة..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <div className="flex items-end gap-2">
            <button onClick={reset} className="rounded-lg border px-4 py-2 text-sm font-bold">إعادة ضبط</button>
            <button onClick={exportCsv} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white">تصدير CSV</button>
          </div>
        </section>

        {invalid && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.</p>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">إنتاج اليوم ضمن الفلاتر (م³)</p><p className="mt-2 text-2xl font-extrabold">{todayTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">إجمالي الكمية المفلترة (م³)</p><p className="mt-2 text-2xl font-extrabold">{total.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">عدد التشغيلات المحملة</p><p className="mt-2 text-2xl font-extrabold">{filtered.length.toLocaleString("en-US")}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">متوسط التشغيلة (م³)</p><p className="mt-2 text-2xl font-extrabold">{(filtered.length ? total / filtered.length : 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</p></div>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">الخامات والإضافات — المتوقع مقابل الفعلي</h2>
            <span className="text-xs text-slate-500">MBZ = المتوقع · CLZ = الفعلي وفق عناوين ملف المصدر</span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {materials.map((group) => (
              <div key={group.id} className="rounded-lg border p-3">
                <h3 className="font-bold">{group.label}</h3>
                {group.items.length ? (
                  <div className="mt-2 space-y-2">
                    {group.items.map((item) => (
                      <div key={item.key} className="border-t pt-2 text-xs">
                        <p className="font-semibold">{item.name}</p>
                        <p className="mt-1 text-slate-500">متوقع: {item.expected.toLocaleString("en-US")} | فعلي: {item.actual.toLocaleString("en-US")}</p>
                        <p className="text-slate-400">فرق: {(item.actual - item.expected).toLocaleString("en-US")}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-2 text-xs text-slate-400">لا توجد قيم ضمن النتائج المحملة.</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-x-auto rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-bold">ملخص الإنتاج اليومي</h2>
          <table className="w-full min-w-[600px] text-right text-sm">
            <thead className="bg-slate-50"><tr>{["التاريخ", "الإنتاج م³", "عدد التشغيلات", "عدد العملاء"].map((value) => <th key={value} className="p-3">{value}</th>)}</tr></thead>
            <tbody>
              {daily.map(([day, value]) => (
                <tr key={day} className="border-t">
                  <td className="p-3">{day}</td>
                  <td className="p-3 font-bold">{value.qty.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                  <td className="p-3">{value.count}</td>
                  <td className="p-3">{value.customers.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">تفاصيل التشغيلات</h2>
            <span className="text-xs text-slate-500">تم تحميل {rows.length.toLocaleString("en-US")} سجلًا — {exhausted ? "كل نتائج الفترة محملة" : "حمّل المزيد لاستكمال النتائج"}</span>
          </div>
          <table className="mt-3 w-full min-w-[1250px] text-right text-sm">
            <thead className="bg-slate-50">
              <tr>{["التاريخ والوقت", "المحطة", "ID المصدر", "رقم التشغيلة", "العميل", "المشروع", "الخلطة", "الإنتاج م³", "رقم الخلاطة", "السائق", "المشغل", "الحالة", "بيانات المصدر"].map((value) => <th key={value} className="whitespace-nowrap p-3">{value}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row._id} className="border-t">
                  <td className="whitespace-nowrap p-3">{new Date(row.productionAt).toLocaleString("ar-EG")}</td>
                  <td className="p-3">{row.station?.name ?? "—"}<div className="text-xs text-slate-400">{row.station?.code}</div></td>
                  <td className="p-3">{row.sourceRecordId}</td>
                  <td className="p-3">{row.jobNo ?? show(raw(row, "Job_No"))}</td>
                  <td className="p-3">{row.customerName ?? "—"}</td>
                  <td className="p-3">{row.projectName ?? "—"}</td>
                  <td className="p-3">{row.concreteGrade ?? "—"}</td>
                  <td className="p-3 font-bold">{row.quantity ?? "—"}</td>
                  <td className="p-3">{row.truckNo ?? show(raw(row, "Truck_No"))}</td>
                  <td className="p-3">{row.driverName ?? row.operatorName ?? show(raw(row, "Driver"))}</td>
                  <td className="p-3">{row.operatorName ?? "—"}</td>
                  <td className="p-3">{row.operationState ?? show(raw(row, "OperationState"))}</td>
                  <td className="p-3">
                    <details>
                      <summary className="cursor-pointer text-teal-700">عرض كل الحقول</summary>
                      <pre className="mt-2 max-w-[550px] overflow-auto whitespace-pre-wrap text-[10px]">{JSON.stringify(row.rawSourceData ?? {}, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {status === "CanLoadMore" && <div className="mt-4 text-center"><button onClick={() => loadMore(500)} className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-bold text-white">تحميل 500 سجل إضافي</button></div>}
          {status === "LoadingMore" && <p className="mt-3 text-center text-sm text-slate-500">جارٍ تحميل المزيد...</p>}
          {status === "LoadingFirstPage" && <p className="mt-3 text-center text-sm text-slate-500">جارٍ تحميل الإنتاج...</p>}
        </section>

        <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-sky-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">المقارنة اليدوية مع DB.MDB — محليًا فقط</h2>
            <span className="text-xs">لا يتم رفع ملف Access</span>
          </div>
          <p>للمقارنة الكاملة: امسح التاريخ وكل فلاتر البحث (يمكنك إبقاء المحطة محددة)، ثم حمّل جميع الصفحات ونزّل JSON. شغّل أداة المقارنة على جهازك واختر DB.MDB وملف JSON يدويًا؛ تُقرأ القاعدة بنسخة مؤقتة Read Only ويُحفظ تقرير CSV وJSON محليًا، دون إرسال ملف Access أو بياناته الخام إلى Vercel أو Convex.</p>
          <button onClick={exportJson} disabled={!exportComplete || !rows.length} className="mt-3 rounded-lg border border-sky-700 px-4 py-2 text-xs font-bold disabled:opacity-40">تنزيل بيانات DeMix للمقارنة JSON</button>
          <p className="mt-2 rounded-lg bg-white/70 p-3 font-mono text-xs" dir="ltr">python .\compare_db.py</p>
        </section>

        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">NAM_WJA1 = Admix1 وNAM_WJA2 = Admix2 حسب الاتفاق. لم أفترض معنى NAM_WJA3 أو أي خانة غير معتمدة. الأعمدة الأخرى محفوظة كما وردت من المصدر. لا يوجد خصم مخزني تلقائي.</p>
      </div>
    </main>
  );
}
