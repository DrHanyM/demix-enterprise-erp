"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type FormState = {
  productionAt: string;
  customerName: string;
  projectName: string;
  jobNo: string;
  concreteGrade: string;
  quantity: string;
  operatorName: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  productionAt: toLocalDateTime(Date.now()),
  customerName: "",
  projectName: "",
  jobNo: "",
  concreteGrade: "",
  quantity: "",
  operatorName: "",
  notes: "",
});

function toLocalDateTime(timestamp: number) {
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function ProductionPage() {
  const router = useRouter();
  const stations = useQuery(api.productionRecords.listMyStations);
  const accessDiagnostics = useQuery(api.productionRecords.getMyStationAccessDiagnostics);
  const [stationId, setStationId] = useState("");
  const selectedStationId = stationId as Id<"stations">;
  const records = useQuery(
    api.productionRecords.listRecords,
    stationId ? { stationId: selectedStationId } : "skip"
  );
  const createRecord = useMutation(api.productionRecords.createRecord);
  const updateRecord = useMutation(api.productionRecords.updateRecord);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<Id<"productionRecords"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const selectedStation = useMemo(
    () => stations?.find((station) => station.id === stationId),
    [stations, stationId]
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEdit(record: NonNullable<typeof records>[number]) {
    setEditingId(record._id);
    setForm({
      productionAt: toLocalDateTime(record.productionAt),
      customerName: record.customerName,
      projectName: record.projectName,
      jobNo: record.jobNo,
      concreteGrade: record.concreteGrade,
      quantity: String(record.quantity),
      operatorName: record.operatorName,
      notes: record.notes ?? "",
    });
    setMessage("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stationId || saving) return;
    setSaving(true);
    setMessage("");
    setError(false);

    const payload = {
      productionAt: new Date(form.productionAt).getTime(),
      customerName: form.customerName,
      projectName: form.projectName,
      jobNo: form.jobNo,
      concreteGrade: form.concreteGrade,
      quantity: Number(form.quantity),
      operatorName: form.operatorName,
      notes: form.notes || undefined,
      operationId: crypto.randomUUID(),
    };

    try {
      if (editingId) {
        await updateRecord({ recordId: editingId, ...payload });
        setMessage("تم حفظ تعديلات سجل الإنتاج بنجاح.");
      } else {
        await createRecord({ stationId: selectedStationId, ...payload });
        setMessage("تم تسجيل بيانات الإنتاج بنجاح.");
      }
      resetForm();
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "تعذر حفظ السجل.");
    } finally {
      setSaving(false);
    }
  }

  if (stations === undefined) {
    return <main dir="rtl" className="min-h-screen bg-slate-950 p-8 text-white">جارٍ تحميل صلاحيات المحطات...</main>;
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-950 p-5 text-white md:p-9">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-blue-400">DEMIX ENTERPRISE ERP</p>
            <h1 className="mt-2 text-3xl font-bold">التشغيل والإنتاج</h1>
            <p className="mt-2 text-sm text-slate-400">إدخال وتعديل سجلات الإنتاج في المحطات المصرح بها فقط.</p>
          </div>
          <button type="button" onClick={() => router.push("/")} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-5 py-3 font-semibold text-white transition hover:border-blue-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label="العودة إلى الصفحة الرئيسية">
            <span aria-hidden="true">→</span>
            العودة للصفحة الرئيسية
          </button>
        </header>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <label htmlFor="station" className="mb-2 block text-sm text-slate-300">المحطة</label>
          <select id="station" value={stationId} onChange={(event) => { setStationId(event.target.value); resetForm(); }} className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white">
            <option value="">اختر المحطة</option>
            {stations.map((station) => <option key={station.id} value={station.id}>{station.name} ({station.code})</option>)}
          </select>
          {stations.length === 0 && <p className="mt-3 text-sm text-amber-300">لا توجد محطات متاحة حاليًا. تفاصيل فحص التكليف والصلاحيات الخاصة بحسابك:</p>}
          {stations.length === 0 && accessDiagnostics !== undefined && (
            <div className="mt-4 space-y-3">
              {accessDiagnostics.length === 0 ? (
                <p className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200">لم يتم العثور على أي تكليف محطة مرتبط بحساب الدخول الحالي.</p>
              ) : accessDiagnostics.map((item, index) => (
                <div key={index} className="rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm">
                  <p className="font-semibold">{item.station ? `${item.station.name} (${item.station.code})` : "محطة غير موجودة"}</p>
                  <p className="mt-1 text-slate-300">حالة التكليف: {item.assignmentStatus} · المحطة: {item.station?.status ?? "غير موجودة"}</p>
                  <p className="mt-1 text-slate-300">الدور: {item.role?.name ?? "غير موجود"} ({item.role?.code ?? "—"}) · النطاق: {item.role?.scope ?? "—"} · الحالة: {item.role?.status ?? "—"}</p>
                  <p className="mt-2 text-slate-300">الصلاحيات:
                    <span className={item.permissions.read ? "text-emerald-300" : "text-red-300"}> قراءة {item.permissions.read ? "✓" : "✕"}</span>
                    {" · "}
                    <span className={item.permissions.create ? "text-emerald-300" : "text-red-300"}> إضافة {item.permissions.create ? "✓" : "✕"}</span>
                    {" · "}
                    <span className={item.permissions.update ? "text-emerald-300" : "text-red-300"}> تعديل {item.permissions.update ? "✓" : "✕"}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {stationId && (
          <>
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 md:p-6">
              <h2 className="text-xl font-bold">{editingId ? "تعديل سجل الإنتاج" : "إضافة سجل إنتاج"} – {selectedStation?.name}</h2>
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="تاريخ ووقت الإنتاج"><input required type="datetime-local" value={form.productionAt} onChange={(e) => updateField("productionAt", e.target.value)} className={inputClass} /></Field>
                  <Field label="العميل"><input required maxLength={160} value={form.customerName} onChange={(e) => updateField("customerName", e.target.value)} className={inputClass} /></Field>
                  <Field label="المشروع"><input required maxLength={160} value={form.projectName} onChange={(e) => updateField("projectName", e.target.value)} className={inputClass} /></Field>
                  <Field label="رقم أمر التشغيل"><input required maxLength={160} value={form.jobNo} onChange={(e) => updateField("jobNo", e.target.value)} className={inputClass} /></Field>
                  <Field label="رتبة الخرسانة"><input required maxLength={160} value={form.concreteGrade} onChange={(e) => updateField("concreteGrade", e.target.value)} className={inputClass} /></Field>
                  <Field label="الكمية (م³)"><input required type="number" min="0.01" max="100000" step="0.01" value={form.quantity} onChange={(e) => updateField("quantity", e.target.value)} className={inputClass} /></Field>
                  <Field label="المشغل"><input required maxLength={160} value={form.operatorName} onChange={(e) => updateField("operatorName", e.target.value)} className={inputClass} /></Field>
                  <div className="md:col-span-2 xl:col-span-3">
                    <Field label="ملاحظات"><textarea maxLength={2000} rows={3} value={form.notes} onChange={(e) => updateField("notes", e.target.value)} className={inputClass} /></Field>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50">{saving ? "جارٍ الحفظ..." : editingId ? "حفظ التعديلات" : "تسجيل الإنتاج"}</button>
                  {editingId && <button type="button" onClick={resetForm} className="rounded-lg border border-slate-600 px-5 py-3">إلغاء التعديل</button>}
                </div>
                {message && <p role="status" className={error ? "text-sm text-red-300" : "text-sm text-emerald-300"}>{message}</p>}
              </form>
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">سجلات الإنتاج – {selectedStation?.name}</h2>
                <span className="text-sm text-slate-400">{records?.length ?? 0} سجل (آخر 200 سجل)</span>
              </div>
              {records === undefined ? <p className="py-6 text-center text-slate-400">جارٍ تحميل السجلات...</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] text-right text-sm">
                    <thead className="border-b border-slate-700 text-slate-400"><tr>{["التاريخ والوقت","العميل","المشروع","أمر التشغيل","الرتبة","الكمية م³","المشغل","الإجراء"].map((label) => <th key={label} className="px-3 py-4">{label}</th>)}</tr></thead>
                    <tbody>
                      {records.map((record) => <tr key={record._id} className="border-b border-slate-800">
                        <td className="px-3 py-4">{new Intl.DateTimeFormat("ar-EG", { dateStyle: "short", timeStyle: "short" }).format(record.productionAt)}</td>
                        <td className="px-3 py-4">{record.customerName}</td><td className="px-3 py-4">{record.projectName}</td><td className="px-3 py-4">{record.jobNo}</td><td className="px-3 py-4">{record.concreteGrade}</td><td className="px-3 py-4 tabular-nums">{record.quantity.toLocaleString("en-US")}</td><td className="px-3 py-4">{record.operatorName}</td>
                        <td className="px-3 py-4"><button type="button" onClick={() => startEdit(record)} className="rounded-md border border-blue-700 px-3 py-2 text-blue-300 hover:bg-blue-950">تعديل</button></td>
                      </tr>)}
                      {records.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">لا توجد سجلات إنتاج لهذه المحطة.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-4 text-xs text-slate-500">لا تتوفر صلاحية حذف السجلات من هذه الشاشة. كل إضافة أو تعديل يُسجل في سجل المراجعة.</p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

const inputClass = "w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-2 text-sm text-slate-300"><span>{label}</span>{children}</label>;
}
