"use client";

import BackToDashboard from "@/components/BackToDashboard";
import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Method = "fingerprint" | "geofence" | "link";
const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500";
const primary = "rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 disabled:opacity-50";
const labels: Record<Method, string> = {
  fingerprint: "ماكينة البصمة",
  geofence: "الموقع الجغرافي",
  link: "رابط / تأكيد رسالة",
};

export default function AttendancePage() {
  const bootstrap = useAction(api.bootstrapAction.bootstrapFirstCentralAdmin);
  const [accessReady, setAccessReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState("");
  useEffect(() => {
    let active = true;
    bootstrap({}).then(() => { if (active) setAccessReady(true); })
      .catch((e: unknown) => { if (active) setBootstrapError(e instanceof Error ? e.message : "تعذر التحقق من صلاحيات المدير."); });
    return () => { active = false; };
  }, [bootstrap]);

  const rows = useQuery(api.attendance.listAttendanceSetup, accessReady ? {} : "skip");
  const save = useMutation(api.attendance.setEmployeeAttendanceMethod);
  const [employeeId, setEmployeeId] = useState("");
  const [method, setMethod] = useState<Method>("fingerprint");
  const [enabled, setEnabled] = useState(true);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("150");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selected = rows?.find((r) => r.employee._id === employeeId);
  const filtered = useMemo(() => (rows ?? []).filter((r) =>
    (r.employee.employeeNo + " " + r.employee.fullName + " " + r.stationName)
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ), [rows, search]);

  function chooseEmployee(id: string) {
    setEmployeeId(id);
    const row = rows?.find((r) => r.employee._id === id);
    const p = row?.policy;
    setMethod(p?.method ?? "fingerprint");
    setEnabled(p?.enabled ?? true);
    setLatitude(p?.latitude === undefined ? "" : String(p.latitude));
    setLongitude(p?.longitude === undefined ? "" : String(p.longitude));
    setRadius(p?.radiusMeters === undefined ? "150" : String(p.radiusMeters));
    setNotes(p?.notes ?? "");
    setNotice("");
    setError("");
  }

  async function handleSave() {
    if (!employeeId) { setError("اختر موظفًا أولاً."); return; }
    const lat = latitude.trim() === "" ? undefined : Number(latitude);
    const lng = longitude.trim() === "" ? undefined : Number(longitude);
    const rad = radius.trim() === "" ? undefined : Number(radius);
    if (method === "geofence" && enabled &&
      (lat === undefined || lng === undefined || rad === undefined ||
       !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(rad))) {
      setError("أدخل إحداثيات صحيحة ونطاقًا بالمتر.");
      return;
    }
    setBusy(true); setNotice(""); setError("");
    try {
      await save({
        employeeId: employeeId as Id<"employees">,
        method, enabled,
        ...(method === "geofence" ? { latitude: lat, longitude: lng, radiusMeters: rad } : {}),
        notes: notes.trim() || undefined,
        operationId: "attendance-policy-" + crypto.randomUUID(),
      });
      setNotice("تم حفظ وسيلة الحضور وتسجيل التغيير في سجل المراجعة.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ الإعداد.");
    } finally { setBusy(false); }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-teal-700">DEMIX ENTERPRISE ERP / HR</p>
            <h1 className="mt-2 text-2xl font-extrabold">الحضور والانصراف – تخصيص وسائل الحضور</h1>
            <p className="mt-2 text-sm text-slate-500">البصمة هي الوسيلة الافتراضية. يمكن للمسؤول المخوّل تخصيص الموقع أو الرابط لموظفين محددين.</p>
          </div>
          <BackToDashboard />
        </header>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-7 text-blue-900">
          <strong>قاعدة النظام:</strong> أي موظف لا يملك تخصيصًا نشطًا يستخدم البصمة افتراضيًا. اختيار الموقع أو الرابط لا يمنح الموظف صلاحية تغيير وسيلته بنفسه.
        </div>
        {bootstrapError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">تعذر التحقق من صلاحيات الوصول: {bootstrapError}</div>}
        {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
        {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="font-bold">تخصيص وسيلة الحضور لموظف</h2>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600">
              الموظف
              <select className={field} value={employeeId} onChange={(e) => chooseEmployee(e.target.value)} disabled={busy}>
                <option value="">اختر الموظف</option>
                {(rows ?? []).map((r) => <option key={r.employee._id} value={r.employee._id}>{r.employee.employeeNo} – {r.employee.fullName}</option>)}
              </select>
            </label>
            {selected && <div className="rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">
              الشركة: {selected.companyName} · المحطة: {selected.stationName}<br />
              الإدارة: {selected.departmentName}
            </div>}
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600">
              وسيلة الحضور
              <select className={field} value={method} onChange={(e) => setMethod(e.target.value as Method)} disabled={busy}>
                <option value="fingerprint">ماكينة البصمة – الافتراضي</option>
                <option value="geofence">الموقع الجغرافي – GPS / نطاق الشركة</option>
                <option value="link">رابط / تأكيد رسالة</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={busy} />
              تفعيل التخصيص لهذا الموظف
            </label>
            {method === "geofence" && <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1.5 text-xs font-semibold text-slate-600">خط العرض (Latitude)<input className={field} value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="30.0444" /></label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-600">خط الطول (Longitude)<input className={field} value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="31.2357" /></label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-600">نطاق السماح بالمتر<input className={field} type="number" min="30" max="2000" value={radius} onChange={(e) => setRadius(e.target.value)} /></label>
            </div>}
            {method === "link" && <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">تم إعداد اختيار هذه الوسيلة إداريًا. إرسال الرسائل والتحقق من هوية الموظف وربط رابط التأكيد سيحتاج إعداد مزود الرسائل وربط حساب الموظف؛ لا يتم احتساب الحضور بمجرد فتح رابط غير موثّق.</p>}
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600">ملاحظات الاعتماد (اختياري)<textarea className={field} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></label>
            <div className="flex flex-wrap gap-2">
              <button className={primary} onClick={() => void handleSave()} disabled={busy || !employeeId}>{busy ? "جارٍ الحفظ..." : "حفظ واعتماد الوسيلة"}</button>
              <button className={secondary} onClick={() => chooseEmployee(employeeId)} disabled={busy || !employeeId}>إعادة تحميل الإعداد</button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold">توزيع وسائل الحضور</h2>
              <span className="text-xs text-slate-500">{rows?.length ?? 0} موظف نشط</span>
            </div>
            <input className={field + " mt-4"} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم أو المحطة..." />
            {!rows ? <p className="mt-4 text-sm text-slate-500">جارٍ تحميل الموظفين...</p> : <div className="mt-4 max-h-[520px] overflow-auto">
              <table className="w-full min-w-[520px] text-right text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-600"><tr><th className="p-3">الموظف</th><th className="p-3">المحطة</th><th className="p-3">الوسيلة الفعلية</th><th className="p-3">الإعداد</th></tr></thead>
                <tbody>{filtered.map((r) => <tr key={r.employee._id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3"><button className="text-right font-semibold text-blue-700 hover:underline" onClick={() => chooseEmployee(r.employee._id)}>{r.employee.fullName}<span className="block pt-1 font-normal text-slate-400">{r.employee.employeeNo}</span></button></td>
                  <td className="p-3">{r.stationName}</td>
                  <td className="p-3">{labels[r.effectiveMethod]}</td>
                  <td className="p-3">{r.policy?.enabled ? "مخصص" : "افتراضي"}</td>
                </tr>)}</tbody>
              </table>
            </div>}
          </div>
        </section>
      </div>
    </main>
  );
}
