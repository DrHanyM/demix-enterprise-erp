"use client";

import BackToDashboard from "@/components/BackToDashboard";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Station = { _id: Id<"stations">; code: string; name: string; status: "active" | "inactive" };
type SyncRow = {
  stationId: Id<"stations">; code: string; name: string; stationStatus: "active" | "inactive";
  syncStatus: string; lastSeenAt?: number; lastSuccessAt?: number; recordsReceived: number;
  recordsInserted: number; recordsUpdated: number; lastError?: string;
};

const packageFiles = [
  ["connector.py", "موصل قراءة قاعدة Access والإرسال"],
  ["requirements.txt", "متطلبات Python"],
  ["PUCH.PS1", "ملف تشغيل المزامنة"],
  ["INSTALL.ps1", "تثبيت مهمة Windows المجدولة"],
] as const;

function downloadText(filename: string, content: string, type = "application/json") {
  const blob = new Blob([content], { type: type + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatDate(value?: number) {
  if (!value) return "لم يتم الاتصال بعد";
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}

function getStationEndpoint() {
  const configured = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!configured) throw new Error("إعداد NEXT_PUBLIC_CONVEX_URL غير متاح في نسخة المعاينة.");
  const url = new URL(configured);
  if (!url.hostname.endsWith(".convex.cloud")) throw new Error("عنوان Convex غير مطابق للنطاق المتوقع.");
  url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  url.pathname = "/station-sync";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export default function StationToolsPage() {
  const stations = useQuery(api.stations.listStations) as Station[] | undefined;
  const syncRows = useQuery(api.stationSync.listSyncStatus) as SyncRow[] | undefined;
  const issueConnectorToken = useMutation(api.stationSync.issueConnectorToken);
  const [selectedStationId, setSelectedStationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeStations = useMemo(() => (stations ?? []).filter((station) => station.status === "active"), [stations]);
  const selectedStation = activeStations.find((station) => station._id === selectedStationId);

  async function prepareStationPackage() {
    if (!selectedStation) { setError("اختر محطة نشطة أولاً."); return; }
    if (!window.confirm("سيتم إصدار مفتاح اتصال جديد لهذه المحطة، وسيتوقف المفتاح السابق عن العمل. هل تريد المتابعة؟")) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const endpoint = getStationEndpoint();
      const token = createToken();
      const tokenHash = await sha256(token);
      const result = await issueConnectorToken({
        stationId: selectedStation._id, tokenHash,
        operationId: "station-connector-token-" + crypto.randomUUID(),
      });
      const profile = {
        stationCode: result.stationCode,
        endpoint,
        connectorToken: token,
        table: "sRecords",
        columns: {
          id: "id", time: "sctime", quantity: "output_vol", job: "job_no",
          grade: "strength", operator: "operator", customer: "CUST_NM", project: "PROJ_NM",
        },
        odbcDriver: "Microsoft Access Driver (*.mdb, *.accdb)",
        requestTimeoutSeconds: 30,
        timezone: "Africa/Cairo",
      };
      downloadText("station-profile.json", JSON.stringify(profile, null, 2));
      downloadText("CONFIG", String.raw`\\192.168.10.1\folderName\DB name.mdb` + "\n", "text/plain");
      setMessage("تم إصدار مفتاح مستقل للمحطة وتنزيل ملفي station-profile.json وCONFIG. احتفظ بملف المفتاح في مكان آمن؛ لن يمكن استعراضه مرة أخرى من الشاشة.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تجهيز ملف المحطة.");
    } finally { setBusy(false); }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-teal-700">DEMIX ENTERPRISE ERP</p>
            <h1 className="mt-1 text-2xl font-extrabold">أدوات المحطات والمزامنة</h1>
            <p className="mt-2 text-sm text-slate-600">تجهيز حزمة الاتصال ومتابعة آخر استقبال للبيانات، دون تغيير شاشة إدارة المحطات الحالية.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/stations" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-100">إدارة المحطات</Link>
            <BackToDashboard />
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold">تجهيز حزمة محطة</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">اختر المحطة من السجل الحالي. سيُنشأ مفتاح اتصال مستقل ويُنزّل ملف التعريف. مسؤول المحطة لا يغيّر إلا سطر مسار قاعدة البيانات واسمها داخل CONFIG.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <select value={selectedStationId} onChange={(event) => setSelectedStationId(event.target.value)} disabled={!activeStations.length || busy} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm">
              <option value="">اختر المحطة</option>
              {activeStations.map((station) => <option key={station._id} value={station._id}>{station.name} — {station.code}</option>)}
            </select>
            <button type="button" onClick={() => void prepareStationPackage()} disabled={!selectedStation || busy} className="rounded-lg bg-[#172b4d] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "جارٍ تجهيز الحزمة..." : "إصدار المفتاح وتنزيل ملفات الإعداد"}
            </button>
          </div>
          {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
          {configReady && <button type="button" onClick={() => downloadText("CONFIG", String.raw`\\\\192.168.10.1\\folderName\\DB name.mdb` + "\\n", "text/plain")} className="mt-3 rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-bold text-teal-800">تنزيل CONFIG — سطر مسار قاعدة البيانات فقط</button>}
          {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">إصدار مفتاح جديد يلغي المفتاح السابق للمحطة. نزّل ملف station-profile.json فور صدوره ولا تشاركه عبر المحادثات. لا تبدأ التثبيت على قاعدة الإنتاج قبل اختبار نسخة قراءة آمنة والتحقق من أسماء الجدول والحقول.</div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="font-bold">ملفات الموصل</h2><p className="mt-1 text-xs text-slate-500">حمّل الملفات إلى مجلد واحد مع ملفي CONFIG وstation-profile.json اللذين تم تنزيلهما أعلاه.</p></div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">إرسال كل 7 دقائق</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {packageFiles.map(([filename, description]) => (
              <a key={filename} href={`https://raw.githubusercontent.com/DrHanyM/demix-enterprise-erp/feature/operations-modules/station-connector/${filename}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 p-4 hover:border-teal-500 hover:bg-teal-50">
                <div className="font-semibold text-blue-800">{filename}</div><div className="mt-1 text-xs text-slate-500">{description}</div><div className="mt-3 text-xs font-bold text-teal-700">فتح / تنزيل الملف ←</div>
              </a>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">بعد تنزيل الملفات، شغّل INSTALL.ps1 بصلاحية مسؤول Windows. ستُنشأ مهمة DEMIX_PRODUCTION_SYNC لتعمل عند بدء التشغيل وكل 7 دقائق، ويمكن تغيير الفاصل لاحقًا من Task Scheduler.</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">حالة اتصال المحطات</h2><p className="mt-1 text-xs text-slate-500">البيانات من سجل الاستقبال المركزي وتتحدث تلقائيًا عند وصول دفعة جديدة.</p></div><span className="text-xs text-slate-500">حالة آخر استقبال</span></div>
          {syncRows === undefined ? <p className="mt-5 text-sm text-slate-500">جارٍ تحميل حالات الاتصال...</p> : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-right text-sm">
                <thead className="bg-slate-100 text-xs text-slate-600"><tr>{["المحطة","حالة الاتصال","آخر استقبال ناجح","السجلات المستلمة","جديدة","محدثة","آخر خطأ"].map((heading) => <th key={heading} className="whitespace-nowrap p-3">{heading}</th>)}</tr></thead>
                <tbody>{syncRows.map((row) => (
                  <tr key={row.stationId} className="border-b border-slate-100">
                    <td className="p-3 font-semibold">{row.name}<div className="text-xs text-slate-400">{row.code}</div></td>
                    <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs ${row.syncStatus === "online" ? "bg-emerald-100 text-emerald-800" : row.syncStatus === "error" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"}`}>{row.syncStatus === "online" ? "استقبل بيانات" : row.syncStatus === "error" ? "خطأ في آخر محاولة" : "لم تتصل بعد"}</span></td>
                    <td className="p-3 whitespace-nowrap">{formatDate(row.lastSuccessAt)}</td><td className="p-3 tabular-nums">{row.recordsReceived}</td><td className="p-3 tabular-nums">{row.recordsInserted}</td><td className="p-3 tabular-nums">{row.recordsUpdated}</td><td className="max-w-64 truncate p-3 text-xs text-rose-700" title={row.lastError}>{row.lastError || "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold">قواعد التشغيل المعتمدة</h2>
          <ul className="mt-3 list-disc space-y-2 pr-5 text-sm leading-6 text-slate-600">
            <li>ملف CONFIG يحتوي سطرًا واحدًا فقط: المسار الكامل واسم قاعدة Access.</li>
            <li>المصدر الأصلي للقراءة فقط؛ الموصل يقرأ نسخة مؤقتة ولا يكتب في قاعدة المحطة.</li>
            <li>طابور محلي دائم وإعادة إرسال تلقائية عند انقطاع الإنترنت، ولا يُسجل السجل مرسلًا إلا بعد تأكيد السيرفر.</li>
            <li>السيرفر يعالج الدفعة فور وصولها؛ فترة 7 دقائق تخص قراءة المحطة والإرسال فقط.</li>
            <li>البيانات المستوردة منفصلة عن سجلات الإنتاج اليدوية ولا تخصم مخزونًا تلقائيًا.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
