"use client";

import BackToDashboard from "@/components/BackToDashboard";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type ImportRow = {
  _id: Id<"stationProductionImports">;
  sourceRecordId: string;
  productionAt: number;
  customerName?: string;
  projectName?: string;
  jobNo?: string;
  concreteGrade?: string;
  quantity?: number;
  operatorName?: string;
  truckNumber?: string;
  driverName?: string;
  rawSourceData?: Record<string, unknown>;
};

function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function sourceValue(raw: Record<string, unknown> | undefined, candidates: string[]) {
  if (!raw) return "—";
  const keys = Object.keys(raw);
  for (const candidate of candidates) {
    const actual = keys.find((key) => key.toLocaleLowerCase() === candidate.toLocaleLowerCase());
    if (!actual) continue;
    const value = raw[actual];
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
    return String(value);
  }
  return "—";
}

function displayDate(value: number) {
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "short", timeStyle: "short" }).format(value);
}

export default function StationProductionPage() {
  const stations = useQuery(api.stations.listStations);
  const [stationId, setStationId] = useState<Id<"stations"> | "">("");
  const [fromDate, setFromDate] = useState(localDateValue());
  const [toDate, setToDate] = useState(localDateValue());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!stationId && stations && stations.length > 0) {
      const rawash = stations.find((station) => station.code === "ST-ARW");
      setStationId(rawash?._id ?? stations[0]._id);
    }
  }, [stationId, stations]);

  const queryArgs = useMemo(() => {
    if (!stationId || !fromDate || !toDate) return "skip" as const;
    const fromAt = new Date(fromDate + "T00:00:00").getTime();
    const toAt = new Date(toDate + "T23:59:59.999").getTime();
    if (!Number.isFinite(fromAt) || !Number.isFinite(toAt) || fromAt > toAt) return "skip" as const;
    return { stationId, fromAt, toAt, limit: 1000 };
  }, [stationId, fromDate, toDate]);

  const result = useQuery(api.stationSync.listProductionImports, queryArgs);
  const rows = result?.items ?? [];
  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.customerName, row.projectName, row.jobNo, row.concreteGrade, row.truckNumber, row.driverName, row.operatorName, row.sourceRecordId]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(term))
    );
  }, [rows, search]);

  const totalQuantity = rows.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
  const selectedStation = stations?.find((station) => station._id === stationId);

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1800px] space-y-6">
        <BackToDashboard />
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">سجل الإنتاج الوارد من المحطات</h1>
            <p className="mt-2 text-sm text-slate-500">عرض بيانات الإنتاج المستلمة من قواعد المحطات، دون خلطها بسجلات الإنتاج اليدوية.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">قراءة فقط</span>
        </header>

        <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2 text-sm">
            <span className="font-semibold">المحطة</span>
            <select value={stationId} onChange={(event) => setStationId(event.target.value as Id<"stations"> | "")} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
              <option value="">اختر المحطة</option>
              {stations?.map((station) => <option key={station._id} value={station._id}>{station.name} – {station.code}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-semibold">من تاريخ</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-semibold">إلى تاريخ</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm md:col-span-2 xl:col-span-2">
            <span className="font-semibold">بحث في العميل أو المشروع أو أمر التشغيل أو السيارة أو السائق</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="اكتب كلمة للبحث..." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" />
          </label>
        </section>

        {fromDate && toDate && fromDate > toDate && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">تاريخ البداية يجب أن يكون قبل تاريخ النهاية.</p>}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">إجمالي إنتاج الفترة – {selectedStation?.name ?? "المحطة"}</p>
            <p className="mt-2 text-2xl font-extrabold tabular-nums">{totalQuantity.toLocaleString("en-US", { maximumFractionDigits: 3 })} <span className="text-sm font-semibold text-slate-500">م³</span></p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">عدد سجلات الإنتاج المستلمة</p>
            <p className="mt-2 text-2xl font-extrabold tabular-nums">{rows.length.toLocaleString("en-US")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">عدد النتائج بعد البحث</p>
            <p className="mt-2 text-2xl font-extrabold tabular-nums">{filteredRows.length.toLocaleString("en-US")}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
            <div>
              <h2 className="font-bold">تفاصيل الإنتاج والخامات</h2>
              <p className="mt-1 text-xs text-slate-500">قيم الخامات تُقرأ من الأعمدة الأصلية المحفوظة مع كل سجل.</p>
            </div>
            <span className="text-xs text-slate-500">حتى 1,000 سجل في الاستعلام الواحد</span>
          </div>
          {result === undefined ? (
            <p className="p-8 text-center text-sm text-slate-500">جارٍ تحميل سجلات الإنتاج...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1900px] w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    {["التاريخ والوقت","ID المصدر","العميل","المشروع","أمر التشغيل","الخلطة / الرتبة","رقم الخلاطة","السائق","السيارة","المتر المكعب","GL","FL","WJ","Shui","NAM_WJA1","NAM_WJA2","المشغل"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 font-bold">{heading}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row: ImportRow) => (
                    <tr key={row._id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-3">{displayDate(row.productionAt)}</td>
                      <td className="px-3 py-3 tabular-nums">{row.sourceRecordId}</td>
                      <td className="px-3 py-3">{row.customerName || "—"}</td>
                      <td className="px-3 py-3">{row.projectName || "—"}</td>
                      <td className="px-3 py-3">{row.jobNo || "—"}</td>
                      <td className="px-3 py-3">{row.concreteGrade || "—"}</td>
                      <td className="px-3 py-3">{sourceValue(row.rawSourceData, ["Mixer_No","MixerNo","Mixer_Number","Mixer"])}</td>
                      <td className="px-3 py-3">{row.driverName || sourceValue(row.rawSourceData, ["Driver","Driver_Name","DriverName"])}</td>
                      <td className="px-3 py-3">{row.truckNumber || "—"}</td>
                      <td className="px-3 py-3 tabular-nums font-bold">{(row.quantity ?? 0).toLocaleString("en-US", { maximumFractionDigits: 3 })}</td>
                      {["GL","FL","WJ","Shui","NAM_WJA1","NAM_WJA2"].map((field) => <td key={field} className="px-3 py-3 tabular-nums">{sourceValue(row.rawSourceData, [field])}</td>)}
                      <td className="px-3 py-3">{row.operatorName || "—"}</td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && <tr><td colSpan={17} className="p-10 text-center text-slate-500">لا توجد سجلات إنتاج في الفترة المحددة.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {result?.hasMore && <p className="border-t border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">توجد سجلات إضافية خارج أول 1,000 سجل. ضيّق الفترة الزمنية لعرضها.</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600">
          <h2 className="font-bold text-slate-800">ملاحظات قراءة الخامات</h2>
          <p className="mt-1">يُعرض حاليًا كل من GL وFL وWJ وShui وNAM_WJA1 وNAM_WJA2 بنفس أسماء أعمدة قاعدة المحطة حتى يتم اعتماد الربط النهائي لأسماء السن والرمل والأسمنت والمياه. الإضافتان الكيميائيتان NAM_WJA1 وNAM_WJA2 هما Admix 1 وAdmix 2.</p>
          <p>هذه الشاشة للعرض والفلترة فقط؛ لا تعدّل بيانات المصدر ولا تخصم مخزونًا.</p>
        </section>
      </div>
    </main>
  );
}
