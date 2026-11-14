"use client";

import { useEffect, useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
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

const MONTHS = [
  ["01", "يناير"], ["02", "فبراير"], ["03", "مارس"], ["04", "أبريل"],
  ["05", "مايو"], ["06", "يونيو"], ["07", "يوليو"], ["08", "أغسطس"],
  ["09", "سبتمبر"], ["10", "أكتوبر"], ["11", "نوفمبر"], ["12", "ديسمبر"],
] as const;
const YEARS = Array.from({ length: 12 }, (_, i) => String(2024 + i));
const monthBounds = (year: string, month: string) => {
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${String(lastDay).padStart(2, "0")}` };
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
    const slots = new Map<string, { name: string; expected: number; actual: number; jdz: number; xdz: number; hsl: number; hgl: number }>();
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
        // Keep distinct material names separate even when they use the same source slot.
        const slotKey = key + "::" + norm(name === "—" ? key : name);
        const value = slots.get(slotKey) ?? { name: label, expected: 0, actual: 0, jdz: 0, xdz: 0, hsl: 0, hgl: 0 };
        value.expected += num(raw(row, "MBZ_" + key));
        value.actual += num(raw(row, "CLZ_" + key));
        value.jdz += num(raw(row, "JDZ_" + key));
        value.xdz += num(raw(row, "XDZ_" + key));
        if (key.startsWith("GL")) value.hsl += num(raw(row, "HSL_" + key));
        if (key.startsWith("WJ")) value.hgl += num(raw(row, "HGL_" + key));
        if (value.name === key && label !== key) value.name = label;
        slots.set(slotKey, value);
      }
    }
    return { ...group, items: [...slots.entries()].map(([key, value]) => ({ key, ...value })) };
  });
}

function breakdown(rows: Row[], keyOf: (row: Row) => string) {
  const groups = new Map<string, { name: string; qty: number; count: number }>();
  for (const row of rows) {
    const name = keyOf(row).trim() || "غير محدد";
    const value = groups.get(name) ?? { name, qty: 0, count: 0 };
    value.qty += row.quantity ?? 0;
    value.count += 1;
    groups.set(name, value);
  }
  return [...groups.values()].sort((a, b) => b.qty - a.qty);
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

function SourceSelect({ label, value, onChange, values }: { label: string; value: string; onChange: (value: string) => void; values: string[] }) {
  return <label className="text-xs text-slate-600">{label}
    <select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">الكل</option>
      {values.map((item) => <option key={item}>{item}</option>)}
    </select>
  </label>;
}

function BreakdownTable({ title, items }: { title: string; items: { name: string; qty: number; count: number }[] }) {
  return <div className="overflow-hidden rounded-xl border bg-white p-4">
    <h3 className="mb-2 font-bold">{title}</h3>
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-right text-xs">
        <thead className="bg-slate-50"><tr><th className="p-2">البند</th><th className="p-2">الإنتاج م³</th><th className="p-2">التشغيلات</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.name} className="border-t"><td className="p-2">{item.name}</td><td className="p-2 font-bold">{item.qty.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td><td className="p-2">{item.count}</td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}

export default function ProductionAnalysisPage() {
  const [from, setFrom] = useState("2026-08-01");
  const [to, setTo] = useState("2026-08-31");
  const [selectedMonth, setSelectedMonth] = useState("08");
  const [selectedYear, setSelectedYear] = useState("2026");
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
  const [pump, setPump] = useState("");
  const [location, setLocation] = useState("");
  const [siteNo, setSiteNo] = useState("");
  const [contract, setContract] = useState("");
  const [techReq, setTechReq] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [productionLine, setProductionLine] = useState("");
  const [operator, setOperator] = useState("");
  const [truckVolume, setTruckVolume] = useState("");
  const [slump, setSlump] = useState("");
  const [kangShen, setKangShen] = useState("");
  const [readState, setReadState] = useState("");
  const [attenderCode, setAttenderCode] = useState("");
  const [constUnit, setConstUnit] = useState("");
  const [saJiangSymbol, setSaJiangSymbol] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  const invalid = Boolean(from && to && from > to);
  const fromAt = from ? new Date(from + "T00:00:00").getTime() : undefined;
  const toAt = to ? new Date(to + "T23:59:59.999").getTime() : undefined;
  const stations = useQuery(api.stations.listActiveStations, {});
  const args = invalid ? "skip" : {
    stationId: stationId ? stationId as Id<"stations"> : undefined,
    fromAt,
    toAt,
    customer: customer || undefined,
    project: project || undefined,
    mix: mix || undefined,
    mixer: mixer || undefined,
    driver: driver || undefined,
    job: job || undefined,
    state: state || undefined,
    pump: pump || undefined,
    location: location || undefined,
    siteNo: siteNo || undefined,
    contract: contract || undefined,
    techReq: techReq || undefined,
    deliveryMode: deliveryMode || undefined,
    productionLine: productionLine || undefined,
    operator: operator || undefined,
    truckVolume: truckVolume || undefined,
    slump: slump || undefined,
    kangShen: kangShen || undefined,
    readState: readState || undefined,
    attenderCode: attenderCode || undefined,
    constUnit: constUnit || undefined,
    saJiangSymbol: saJiangSymbol || undefined,
  };
  const { results, status, loadMore } = usePaginatedQuery(api.operations.listImportedProductionPage, args, { initialNumItems: 500 });
  const rows = useMemo(() => (results ?? []) as unknown as Row[], [results]);

  useEffect(() => {
    if (status === "CanLoadMore") loadMore(500);
  }, [status, loadMore]);

  const options = useMemo(() => ({
    customers: [...new Set(rows.map((r) => r.customerName ?? raw(r, "CUST_NM")).filter(Boolean) as string[])].sort(),
    projects: [...new Set(rows.map((r) => r.projectName ?? raw(r, "PROJ_NM")).filter(Boolean) as string[])].sort(),
    mixes: [...new Set(rows.map((r) => r.concreteGrade ?? raw(r, "Strength")).filter(Boolean) as string[])].sort(),
    mixers: [...new Set(rows.map((r) => show(r.truckNo ?? raw(r, "Truck_No"))).filter((x) => x !== "—"))].sort(),
    drivers: [...new Set(rows.map((r) => show(r.driverName ?? raw(r, "Driver"))).filter((x) => x !== "—"))].sort(),
    jobs: [...new Set(rows.map((r) => show(r.jobNo ?? raw(r, "Job_No"))).filter((x) => x !== "—"))].sort(),
    states: [...new Set(rows.map((r) => show(r.operationState ?? raw(r, "OperationState"))).filter((x) => x !== "—"))].sort(),
    pumps: [...new Set(rows.map((r) => show(raw(r, "Prop_No"))).filter((x) => x !== "—"))].sort(),
    locations: [...new Set(rows.map((r) => show(raw(r, "Location"))).filter((x) => x !== "—"))].sort(),
    siteNos: [...new Set(rows.map((r) => show(raw(r, "Site_No"))).filter((x) => x !== "—"))].sort(),
    contracts: [...new Set(rows.map((r) => show(raw(r, "Contr_No"))).filter((x) => x !== "—"))].sort(),
    techReqs: [...new Set(rows.map((r) => show(raw(r, "Tech_Req"))).filter((x) => x !== "—"))].sort(),
    deliveryModes: [...new Set(rows.map((r) => show(raw(r, "Delivery_Mode"))).filter((x) => x !== "—"))].sort(),
    productionLines: [...new Set(rows.map((r) => show(raw(r, "ProduceLine"))).filter((x) => x !== "—"))].sort(),
    operators: [...new Set(rows.map((r) => show(raw(r, "Operator"))).filter((x) => x !== "—"))].sort(),
    truckVolumes: [...new Set(rows.map((r) => show(raw(r, "Truck_vol"))).filter((x) => x !== "—"))].sort(),
    slumps: [...new Set(rows.map((r) => show(raw(r, "TaLuoDu"))).filter((x) => x !== "—"))].sort(),
    kangShenLevels: [...new Set(rows.map((r) => show(raw(r, "KangShenLevel"))).filter((x) => x !== "—"))].sort(),
    readStates: [...new Set(rows.map((r) => show(raw(r, "ReadState"))).filter((x) => x !== "—"))].sort(),
    attenderCodes: [...new Set(rows.map((r) => show(raw(r, "AttemperCode"))).filter((x) => x !== "—"))].sort(),
    constUnits: [...new Set(rows.map((r) => show(raw(r, "Const_Unit"))).filter((x) => x !== "—"))].sort(),
    saJiangSymbols: [...new Set(rows.map((r) => show(raw(r, "SaJiangSymbol"))).filter((x) => x !== "—"))].sort(),
  }), [rows]);

  const filtered = useMemo(() => rows.filter((row) => {
    const date = new Date(row.productionAt);
    const time = String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
    const driverValue = row.driverName ?? raw(row, "Driver");
    return (!fromTime || time >= fromTime)
      && (!toTime || time <= toTime)
      && (!customer || norm(row.customerName ?? raw(row, "CUST_NM")) === norm(customer))
      && (!project || norm(row.projectName ?? raw(row, "PROJ_NM")) === norm(project))
      && (!mix || norm(row.concreteGrade ?? raw(row, "Strength")) === norm(mix))
      && (!mixer || norm(row.truckNo ?? raw(row, "Truck_No")) === norm(mixer))
      && (!driver || norm(driverValue) === norm(driver))
      && (!job || norm(row.jobNo ?? raw(row, "Job_No")) === norm(job))
      && (!state || norm(row.operationState ?? raw(row, "OperationState")) === norm(state))
      && (!pump || norm(raw(row, "Prop_No")) === norm(pump))
      && (!location || norm(raw(row, "Location")) === norm(location))
      && (!siteNo || norm(raw(row, "Site_No")) === norm(siteNo))
      && (!contract || norm(raw(row, "Contr_No")) === norm(contract))
      && (!techReq || norm(raw(row, "Tech_Req")) === norm(techReq))
      && (!deliveryMode || norm(raw(row, "Delivery_Mode")) === norm(deliveryMode))
      && (!productionLine || norm(raw(row, "ProduceLine")) === norm(productionLine))
      && (!operator || norm(raw(row, "Operator")) === norm(operator))
      && (!truckVolume || norm(raw(row, "Truck_vol")) === norm(truckVolume))
      && (!slump || norm(raw(row, "TaLuoDu")) === norm(slump))
      && (!kangShen || norm(raw(row, "KangShenLevel")) === norm(kangShen))
      && (!readState || norm(raw(row, "ReadState")) === norm(readState))
      && (!attenderCode || norm(raw(row, "AttemperCode")) === norm(attenderCode))
      && (!constUnit || norm(raw(row, "Const_Unit")) === norm(constUnit))
      && (!saJiangSymbol || norm(raw(row, "SaJiangSymbol")) === norm(saJiangSymbol))
      && (!notes || [raw(row, "Remark"), raw(row, "RecordRemark"), raw(row, "SynchRemark")].some((value) => norm(value).includes(norm(notes))))
      && (!search || [row.sourceRecordId, row.jobNo, row.customerName, row.projectName, row.concreteGrade, row.truckNo, driverValue, row.operatorName, row.operationState, row.station?.name, row.station?.code, raw(row, "CUST_NM"), raw(row, "PROJ_NM"), raw(row, "Strength"), raw(row, "Prop_No"), raw(row, "Location"), raw(row, "Site_No"), ...Object.values(row.rawSourceData ?? {})].some((value) => norm(value).includes(norm(search))));
  }), [rows, fromTime, toTime, customer, project, mix, mixer, driver, job, state, pump, location, siteNo, contract, techReq, deliveryMode, productionLine, operator, truckVolume, slump, kangShen, readState, attenderCode, constUnit, saJiangSymbol, notes, search]);

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
      const customerName = row.customerName ?? raw(row, "CUST_NM");
      if (customerName) value.customers.add(String(customerName));
      groups.set(day, value);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);
  const hourly = useMemo(() => breakdown(filtered, (row) => {
    const date = new Date(row.productionAt);
    return dayOf(row.productionAt) + " " + String(date.getHours()).padStart(2, "0") + ":00";
  }), [filtered]);
  const monthly = useMemo(() => breakdown(filtered, (row) => dayOf(row.productionAt).slice(0, 7)), [filtered]);
  const yearly = useMemo(() => breakdown(filtered, (row) => dayOf(row.productionAt).slice(0, 4)), [filtered]);
  const byStation = useMemo(() => breakdown(filtered, (row) => row.station?.name ?? ""), [filtered]);
  const byCustomer = useMemo(() => breakdown(filtered, (row) => String(row.customerName ?? raw(row, "CUST_NM") ?? "")), [filtered]);
  const byProject = useMemo(() => breakdown(filtered, (row) => String(row.projectName ?? raw(row, "PROJ_NM") ?? "")), [filtered]);
  const byLine = useMemo(() => breakdown(filtered, (row) => show(raw(row, "ProduceLine"))), [filtered]);
  const byMixer = useMemo(() => breakdown(filtered, (row) => show(row.truckNo ?? raw(row, "Truck_No"))), [filtered]);
  const byDriver = useMemo(() => breakdown(filtered, (row) => show(row.driverName ?? raw(row, "Driver"))), [filtered]);
  const byStrength = useMemo(() => breakdown(filtered, (row) => show(row.concreteGrade ?? raw(row, "Strength"))), [filtered]);
  const byLocation = useMemo(() => breakdown(filtered, (row) => show(raw(row, "Location"))), [filtered]);
  const byDeliveryMode = useMemo(() => breakdown(filtered, (row) => show(raw(row, "Delivery_Mode"))), [filtered]);
  const duplicateCount = useMemo(() => {
    const seen = new Set<string>(), duplicates = new Set<string>();
    for (const row of filtered) {
      const key = (row.station?.code ?? "") + ":" + row.sourceRecordId;
      if (seen.has(key)) duplicates.add(key); else seen.add(key);
    }
    return duplicates.size;
  }, [filtered]);
  const incompleteCount = filtered.filter((row) => !(row.customerName ?? raw(row, "CUST_NM")) || !(row.projectName ?? raw(row, "PROJ_NM")) || !(row.jobNo ?? raw(row, "Job_No")) || row.quantity === undefined).length;

  const exhausted = status === "Exhausted";
  const reset = () => {
    setSelectedMonth("08"); setSelectedYear("2026"); setFrom("2026-08-01"); setTo("2026-08-31"); setFromTime(""); setToTime(""); setStationId("");
    setCustomer(""); setProject(""); setMix(""); setMixer(""); setDriver(""); setJob(""); setState("");
    setPump(""); setLocation(""); setSiteNo(""); setContract(""); setTechReq(""); setDeliveryMode(""); setProductionLine("");
    setOperator(""); setTruckVolume(""); setSlump(""); setKangShen(""); setReadState(""); setAttenderCode(""); setConstUnit(""); setSaJiangSymbol(""); setNotes(""); setSearch("");
  };

  const exportCsv = () => {
    if (!exhausted) {
      window.alert("حمّل جميع سجلات الفترة أولاً حتى يكون ملف التصدير كاملاً.");
      return;
    }
    const baseColumns = ["sourceRecordId", "productionAt", "station", "jobNo", "customerName", "projectName", "concreteGrade", "quantity", "truckNo", "driverName", "operatorName", "operationState"];
    const sourceColumns = [...new Set(filtered.flatMap((row) => Object.keys(row.rawSourceData ?? {})))].sort((a, b) => a.localeCompare(b));
    const columns = [...baseColumns, ...sourceColumns.map((column) => "source:" + column)];
    const escapeCsv = (value: unknown) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const valueFor = (row: Row, column: string): unknown => {
      if (column === "station") return row.station?.name;
      if (column.startsWith("source:")) return raw(row, column.slice(7));
      return row[column as keyof Row];
    };
    const lines = [columns.map((column) => escapeCsv(column.startsWith("source:") ? column.slice(7) : column)).join(","), ...filtered.map((row) => columns.map((column) => escapeCsv(valueFor(row, column))).join(","))];
    saveFile("demix-production-filtered.csv", "\ufeff" + lines.join("\r\n"), "text/csv;charset=utf-8");
  };

  const exportJsonForComparison = () => {
    if (!exhausted) {
      window.alert("حمّل جميع سجلات الفترة أولاً حتى لا تكون المقارنة ناقصة.");
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      source: "stationProductionImports",
      records: rows.map((row) => ({
        stationCode: row.station?.code ?? "",
        sourceRecordId: row.sourceRecordId,
        rawSourceData: row.rawSourceData ?? {},
      })),
    };
    saveFile(
      "demix-production-for-db-comparison.json",
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
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
          <label className="text-xs text-slate-600">الشهر
            <select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={selectedMonth} onChange={(e) => {
              const month = e.target.value; setSelectedMonth(month);
              if (month && selectedYear) { const range = monthBounds(selectedYear, month); setFrom(range.from); setTo(range.to); }
              else { setFrom(""); setTo(""); }
            }}>
              <option value="">نطاق مخصص</option>
              {MONTHS.map(([value, label]) => <option key={value} value={value}>{value} — {label}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">السنة
            <select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={selectedYear} onChange={(e) => {
              const year = e.target.value; setSelectedYear(year);
              if (year && selectedMonth) { const range = monthBounds(year, selectedMonth); setFrom(range.from); setTo(range.to); }
              else { setFrom(""); setTo(""); }
            }}>
              <option value="">نطاق مخصص</option>
              {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">من تاريخ<input type="date" className="mt-1 block w-full rounded-lg border p-2 text-sm" value={from} onChange={(e) => { setFrom(e.target.value); setSelectedMonth(""); setSelectedYear(""); }} /></label>
          <label className="text-xs text-slate-600">إلى تاريخ<input type="date" className="mt-1 block w-full rounded-lg border p-2 text-sm" value={to} onChange={(e) => { setTo(e.target.value); setSelectedMonth(""); setSelectedYear(""); }} /></label>
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
          <label className="text-xs text-slate-600">اسم الخلطة المستخدمة / Strength
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
          <SourceSelect label="المضخة المستخدمة / Prop_No" value={pump} onChange={setPump} values={options.pumps} />
          <SourceSelect label="الموقع / Location" value={location} onChange={setLocation} values={options.locations} />
          <SourceSelect label="رقم الموقع / Site_No" value={siteNo} onChange={setSiteNo} values={options.siteNos} />
          <SourceSelect label="العقد / Contr_No" value={contract} onChange={setContract} values={options.contracts} />
          <SourceSelect label="المتطلبات الفنية / Tech_Req" value={techReq} onChange={setTechReq} values={options.techReqs} />
          <SourceSelect label="طريقة التسليم / Delivery_Mode" value={deliveryMode} onChange={setDeliveryMode} values={options.deliveryModes} />
          <SourceSelect label="خط الإنتاج / ProduceLine" value={productionLine} onChange={setProductionLine} values={options.productionLines} />
          <SourceSelect label="المشغل / Operator" value={operator} onChange={setOperator} values={options.operators} />
          <SourceSelect label="سعة الخلاطة / Truck_vol" value={truckVolume} onChange={setTruckVolume} values={options.truckVolumes} />
          <SourceSelect label="الهبوط / TaLuoDu" value={slump} onChange={setSlump} values={options.slumps} />
          <SourceSelect label="KangShenLevel (المصدر)" value={kangShen} onChange={setKangShen} values={options.kangShenLevels} />
          <SourceSelect label="حالة القراءة / ReadState" value={readState} onChange={setReadState} values={options.readStates} />
          <SourceSelect label="AttemperCode (المصدر)" value={attenderCode} onChange={setAttenderCode} values={options.attenderCodes} />
          <SourceSelect label="Const_Unit (المصدر)" value={constUnit} onChange={setConstUnit} values={options.constUnits} />
          <SourceSelect label="رمز المصدر / SaJiangSymbol" value={saJiangSymbol} onChange={setSaJiangSymbol} values={options.saJiangSymbols} />
          <label className="text-xs text-slate-600">بحث في الملاحظات
            <input className="mt-1 block w-full rounded-lg border p-2 text-sm" placeholder="Remark / RecordRemark / SynchRemark" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600 xl:col-span-2">بحث عام
            <input className="mt-1 block w-full rounded-lg border p-2 text-sm" placeholder="ID أو العميل أو المشروع أو الخلطة..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <div className="flex items-end gap-2">
            <button onClick={reset} className="rounded-lg border px-4 py-2 text-sm font-bold">إعادة ضبط</button>
            <button onClick={exportCsv} disabled={!exhausted} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">تصدير CSV كامل</button>
            <button onClick={exportJsonForComparison} disabled={!exhausted} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">تصدير JSON للمقارنة المحلية</button>
          </div>
        </section>

        {invalid && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.</p>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">إنتاج اليوم ضمن الفلاتر (م³)</p><p className="mt-2 text-2xl font-extrabold">{todayTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">إجمالي الكمية المفلترة (م³)</p><p className="mt-2 text-2xl font-extrabold">{total.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">عدد التشغيلات المحملة</p><p className="mt-2 text-2xl font-extrabold">{filtered.length.toLocaleString("en-US")}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">متوسط التشغيلة (م³)</p><p className="mt-2 text-2xl font-extrabold">{(filtered.length ? total / filtered.length : 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">تكرار معرف المصدر داخل النتائج</p><p className="mt-2 text-2xl font-extrabold">{duplicateCount.toLocaleString("en-US")}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">تشغيلات ناقصة بيانات أساسية</p><p className="mt-2 text-2xl font-extrabold">{incompleteCount.toLocaleString("en-US")}</p></div>
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
                        <p className="text-slate-500">لكل م³ — متوقع: {(total > 0 ? item.expected / total : 0).toLocaleString("en-US", { maximumFractionDigits: 3 })} | فعلي: {(total > 0 ? item.actual / total : 0).toLocaleString("en-US", { maximumFractionDigits: 3 })}</p>
                        <p className="text-slate-400">فرق MBZ/CLZ: {(item.actual - item.expected).toLocaleString("en-US")} | الفرق لكل م³: {(total > 0 ? (item.actual - item.expected) / total : 0).toLocaleString("en-US", { maximumFractionDigits: 3 })}</p>
                        <p className="mt-1 text-slate-500">حقول المصدر الإضافية — JDZ: {item.jdz.toLocaleString("en-US")} | XDZ: {item.xdz.toLocaleString("en-US")}{item.hsl ? " | HSL: " + item.hsl.toLocaleString("en-US") : ""}{item.hgl ? " | HGL: " + item.hgl.toLocaleString("en-US") : ""}</p>
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
        <section className="grid gap-3 xl:grid-cols-3">
          <BreakdownTable title="الإنتاج بالساعة" items={hourly} />
          <BreakdownTable title="الإنتاج الشهري" items={monthly} />
          <BreakdownTable title="الإنتاج السنوي" items={yearly} />
        </section>
        <section className="grid gap-3 xl:grid-cols-2">
          <BreakdownTable title="مقارنة الإنتاج حسب المحطة" items={byStation} />
          <BreakdownTable title="مقارنة الإنتاج حسب خط الإنتاج" items={byLine} />
          <BreakdownTable title="إنتاج الخلاطات / Truck_No" items={byMixer} />
          <BreakdownTable title="إنتاج السائقين / Driver" items={byDriver} />
          <BreakdownTable title="توزيع الخلطات / Strength" items={byStrength} />
          <BreakdownTable title="إنتاج المواقع" items={byLocation} />
          <BreakdownTable title="طرق التسليم" items={byDeliveryMode} />
          <BreakdownTable title="إنتاج العملاء" items={byCustomer} />
          <BreakdownTable title="إنتاج المشروعات" items={byProject} />
        </section>

        <section className="overflow-x-auto rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">تفاصيل التشغيلات</h2>
            <span className="text-xs text-slate-500">تم تحميل {rows.length.toLocaleString("en-US")} سجلًا — {exhausted ? "كل نتائج الفترة محملة" : status === "CanLoadMore" || status === "LoadingMore" ? "جارٍ تحميل بقية النتائج تلقائيًا" : "جارٍ تحميل النتائج"}</span>
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
                  <td className="p-3">{show(row.customerName ?? raw(row, "CUST_NM"))}</td>
                  <td className="p-3">{show(row.projectName ?? raw(row, "PROJ_NM"))}</td>
                  <td className="p-3">{show(row.concreteGrade ?? raw(row, "Strength"))}</td>
                  <td className="p-3 font-bold">{row.quantity ?? "—"}</td>
                  <td className="p-3">{row.truckNo ?? show(raw(row, "Truck_No"))}</td>
                  <td className="p-3">{row.driverName ?? show(raw(row, "Driver"))}</td>
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
          {status === "LoadingMore" && <p className="mt-3 text-center text-sm text-slate-500">جارٍ تحميل المزيد...</p>}
          {status === "LoadingFirstPage" && <p className="mt-3 text-center text-sm text-slate-500">جارٍ تحميل الإنتاج...</p>}
        </section>

        <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-sky-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">المقارنة اليدوية مع DB.MDB — محليًا فقط</h2>
            <span className="text-xs">لا يتم رفع ملف Access</span>
          </div>
          <p>للمقارنة الكاملة: حمّل جميع سجلات الفترة ثم صدّر JSON من الزر أعلاه. على جهاز المحطة شغّل أداة المقارنة المحلية واختر DB.MDB وملف JSON. تتم المقارنة محليًا دون رفع ملف Access أو تعديل قاعدة المحطة، ويُحفظ تقرير CSV وJSON على الجهاز.</p>
          <p className="mt-3 rounded-lg bg-white/70 p-3 font-mono text-xs" dir="ltr">py .\\compare_db.py</p>
        </section>

        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">NAM_WJA1 = Admix1 وNAM_WJA2 = Admix2 حسب الاتفاق. لم أفترض معنى NAM_WJA3 أو أي خانة غير معتمدة. الأعمدة الأخرى محفوظة كما وردت من المصدر. لا يوجد خصم مخزني تلقائي.</p>
      </div>
    </main>
  );
}
