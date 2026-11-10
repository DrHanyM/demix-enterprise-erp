"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500";
const buttonClass = "rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50";

export default function HrStructurePage() {
  const ensurePreviewAdmin = useAction(api.bootstrapAction.bootstrapFirstCentralAdmin);
  const [accessReady, setAccessReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState("");

  useEffect(() => {
    let active = true;
    ensurePreviewAdmin({})
      .then(() => {
        if (active) setAccessReady(true);
      })
      .catch((reason: unknown) => {
        if (active) {
          setBootstrapError(reason instanceof Error ? reason.message : "تعذر التحقق من صلاحيات المدير المركزي.");
        }
      });
    return () => { active = false; };
  }, [ensurePreviewAdmin]);

  const companies = useQuery(api.hrCore.listCompanies, accessReady ? {} : "skip");
  const departments = useQuery(api.hrCore.listDepartments, accessReady ? {} : "skip");
  const jobTitles = useQuery(api.hrCore.listJobTitles, accessReady ? {} : "skip");
  const stations = useQuery(api.stations.listStations, accessReady ? {} : "skip");

  const createCompany = useMutation(api.hrCore.createCompany);
  const updateCompany = useMutation(api.hrCore.updateCompany);
  const createDepartment = useMutation(api.hrCore.createDepartment);
  const updateDepartment = useMutation(api.hrCore.updateDepartment);
  const createJobTitle = useMutation(api.hrCore.createJobTitle);
  const updateJobTitle = useMutation(api.hrCore.updateJobTitle);

  const [companyCode, setCompanyCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [departmentCode, setDepartmentCode] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [departmentCompanyId, setDepartmentCompanyId] = useState("");
  const [departmentStationId, setDepartmentStationId] = useState("");
  const [departmentParentId, setDepartmentParentId] = useState("");
  const [jobCode, setJobCode] = useState("");
  const [jobName, setJobName] = useState("");
  const [jobDepartmentId, setJobDepartmentId] = useState("");
  const [jobGrade, setJobGrade] = useState("");
  const [editingCompanyId, setEditingCompanyId] = useState<Id<"companies"> | null>(null);
  const [editingDepartmentId, setEditingDepartmentId] = useState<Id<"departments"> | null>(null);
  const [editingJobId, setEditingJobId] = useState<Id<"jobTitles"> | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function beginAction() {
    setBusy(true);
    setNotice("");
    setError("");
  }

  function finishError(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "تعذر تنفيذ العملية.");
  }

  async function handleCreateCompany() {
    if (!companyCode.trim() || !companyName.trim()) {
      setError("أدخل كود الشركة واسمها.");
      return;
    }
    beginAction();
    try {
      await createCompany({
        code: companyCode.trim(),
        name: companyName.trim(),
        operationId: "hr-company-create-" + crypto.randomUUID(),
      });
      setCompanyCode("");
      setCompanyName("");
      setNotice("تم تسجيل الشركة بنجاح.");
    } catch (reason) {
      finishError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateDepartment() {
    if (!departmentCode.trim() || !departmentName.trim() || !departmentCompanyId) {
      setError("أدخل كود الإدارة واسمها واختر الشركة.");
      return;
    }
    beginAction();
    try {
      await createDepartment({
        code: departmentCode.trim(),
        name: departmentName.trim(),
        companyId: departmentCompanyId as Id<"companies">,
        stationId: departmentStationId ? departmentStationId as Id<"stations"> : undefined,
        parentDepartmentId: departmentParentId ? departmentParentId as Id<"departments"> : undefined,
        operationId: "hr-department-create-" + crypto.randomUUID(),
      });
      setDepartmentCode("");
      setDepartmentName("");
      setDepartmentStationId("");
      setDepartmentParentId("");
      setNotice("تم تسجيل الإدارة بنجاح.");
    } catch (reason) {
      finishError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateJob() {
    if (!jobCode.trim() || !jobName.trim()) {
      setError("أدخل كود الوظيفة واسمها.");
      return;
    }
    beginAction();
    try {
      await createJobTitle({
        code: jobCode.trim(),
        name: jobName.trim(),
        departmentId: jobDepartmentId ? jobDepartmentId as Id<"departments"> : undefined,
        grade: jobGrade.trim() || undefined,
        operationId: "hr-job-create-" + crypto.randomUUID(),
      });
      setJobCode("");
      setJobName("");
      setJobGrade("");
      setJobDepartmentId("");
      setNotice("تم تسجيل الوظيفة بنجاح.");
    } catch (reason) {
      finishError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function saveCompany(companyId: Id<"companies">) {
    if (!editName.trim()) return;
    beginAction();
    try {
      await updateCompany({
        companyId,
        name: editName.trim(),
        operationId: "hr-company-update-" + crypto.randomUUID(),
      });
      setEditingCompanyId(null);
      setNotice("تم تحديث الشركة.");
    } catch (reason) {
      finishError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function changeCompanyStatus(companyId: Id<"companies">, status: "active" | "inactive") {
    beginAction();
    try {
      await updateCompany({
        companyId,
        status,
        operationId: "hr-company-status-" + crypto.randomUUID(),
      });
      setNotice("تم تحديث حالة الشركة.");
    } catch (reason) {
      finishError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function saveDepartment(departmentId: Id<"departments">) {
    if (!editName.trim()) return;
    beginAction();
    try {
      await updateDepartment({
        departmentId,
        name: editName.trim(),
        operationId: "hr-department-update-" + crypto.randomUUID(),
      });
      setEditingDepartmentId(null);
      setNotice("تم تحديث الإدارة.");
    } catch (reason) {
      finishError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function changeDepartmentStatus(departmentId: Id<"departments">, status: "active" | "inactive") {
    beginAction();
    try {
      await updateDepartment({
        departmentId,
        status,
        operationId: "hr-department-status-" + crypto.randomUUID(),
      });
      setNotice("تم تحديث حالة الإدارة.");
    } catch (reason) {
      finishError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function saveJob(jobTitleId: Id<"jobTitles">) {
    if (!editName.trim()) return;
    beginAction();
    try {
      await updateJobTitle({
        jobTitleId,
        name: editName.trim(),
        operationId: "hr-job-update-" + crypto.randomUUID(),
      });
      setEditingJobId(null);
      setNotice("تم تحديث الوظيفة.");
    } catch (reason) {
      finishError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function changeJobStatus(jobTitleId: Id<"jobTitles">, status: "active" | "inactive") {
    beginAction();
    try {
      await updateJobTitle({
        jobTitleId,
        status,
        operationId: "hr-job-status-" + crypto.randomUUID(),
      });
      setNotice("تم تحديث حالة الوظيفة.");
    } catch (reason) {
      finishError(reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-teal-700">DEMIX ENTERPRISE ERP / HR</p>
            <h1 className="mt-2 text-2xl font-extrabold">الهيكل التنظيمي</h1>
            <p className="mt-2 text-sm text-slate-500">إدارة الشركات والإدارات والوظائف وربطها بالمحطات.</p>
          </div>
          <a href="/" className="text-sm font-semibold text-blue-700 hover:underline">العودة إلى لوحة التحكم</a>
        </header>

        {bootstrapError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">تعذر تهيئة صلاحيات الوصول: {bootstrapError}</div>}

        {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
        {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

        <section className="grid gap-5 xl:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold">إضافة شركة</h2>
            <div className="mt-4 space-y-3">
              <input className={fieldClass} value={companyCode} onChange={e => setCompanyCode(e.target.value)} placeholder="كود الشركة" maxLength={30} disabled={busy} />
              <input className={fieldClass} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="اسم الشركة" maxLength={120} disabled={busy} />
              <button className={buttonClass} onClick={() => void handleCreateCompany()} disabled={busy}>حفظ الشركة</button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold">إضافة إدارة / قسم</h2>
            <div className="mt-4 space-y-3">
              <input className={fieldClass} value={departmentCode} onChange={e => setDepartmentCode(e.target.value)} placeholder="كود الإدارة" maxLength={30} disabled={busy} />
              <input className={fieldClass} value={departmentName} onChange={e => setDepartmentName(e.target.value)} placeholder="اسم الإدارة" maxLength={120} disabled={busy} />
              <select className={fieldClass} value={departmentCompanyId} onChange={e => setDepartmentCompanyId(e.target.value)} disabled={busy}>
                <option value="">اختر الشركة</option>
                {(companies ?? []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              <select className={fieldClass} value={departmentStationId} onChange={e => setDepartmentStationId(e.target.value)} disabled={busy}>
                <option value="">إدارة مركزية / دون محطة</option>
                {(stations ?? []).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
              <select className={fieldClass} value={departmentParentId} onChange={e => setDepartmentParentId(e.target.value)} disabled={busy || !departmentCompanyId}>
                <option value="">دون إدارة رئيسية</option>
                {(departments ?? []).filter(d => d.companyId === departmentCompanyId && d.status === "active").map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
              <button className={buttonClass} onClick={() => void handleCreateDepartment()} disabled={busy || !companies?.length}>حفظ الإدارة</button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold">إضافة وظيفة</h2>
            <div className="mt-4 space-y-3">
              <input className={fieldClass} value={jobCode} onChange={e => setJobCode(e.target.value)} placeholder="كود الوظيفة" maxLength={30} disabled={busy} />
              <input className={fieldClass} value={jobName} onChange={e => setJobName(e.target.value)} placeholder="المسمى الوظيفي" maxLength={120} disabled={busy} />
              <select className={fieldClass} value={jobDepartmentId} onChange={e => setJobDepartmentId(e.target.value)} disabled={busy}>
                <option value="">وظيفة عامة / دون إدارة محددة</option>
                {(departments ?? []).filter(d => d.status === "active").map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
              <input className={fieldClass} value={jobGrade} onChange={e => setJobGrade(e.target.value)} placeholder="الدرجة الوظيفية (اختياري)" maxLength={40} disabled={busy} />
              <button className={buttonClass} onClick={() => void handleCreateJob()} disabled={busy}>حفظ الوظيفة</button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-bold">الشركات المسجلة</h2>
            <span className="text-xs text-slate-500">{companies?.length ?? 0} شركة</span>
          </div>
          {!companies ? <p className="text-sm text-slate-500">جارٍ تحميل الشركات...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-right text-sm">
                <thead className="bg-slate-100 text-slate-600"><tr><th className="p-3">الكود</th><th className="p-3">اسم الشركة</th><th className="p-3">الحالة</th><th className="p-3">الإجراء</th></tr></thead>
                <tbody>{companies.map(c => <tr key={c._id} className="border-t border-slate-100">
                  <td className="p-3 font-semibold">{c.code}</td>
                  <td className="p-3">{editingCompanyId === c._id ? <input className={fieldClass} value={editName} onChange={e => setEditName(e.target.value)} /> : c.name}</td>
                  <td className="p-3">{c.status === "active" ? "نشطة" : "متوقفة"}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-2">
                    {editingCompanyId === c._id ? <><button className={buttonClass} onClick={() => void saveCompany(c._id)} disabled={busy}>حفظ</button><button className={secondaryButtonClass} onClick={() => setEditingCompanyId(null)}>إلغاء</button></> : <><button className={secondaryButtonClass} onClick={() => { setEditingCompanyId(c._id); setEditName(c.name); }}>تعديل</button><button className={secondaryButtonClass} onClick={() => void changeCompanyStatus(c._id, c.status === "active" ? "inactive" : "active")} disabled={busy}>{c.status === "active" ? "إيقاف" : "تفعيل"}</button></>}
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-bold">الإدارات والأقسام</h2>
            <span className="text-xs text-slate-500">{departments?.length ?? 0} إدارة</span>
          </div>
          {!departments ? <p className="text-sm text-slate-500">جارٍ تحميل الإدارات...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-right text-sm">
                <thead className="bg-slate-100 text-slate-600"><tr><th className="p-3">الكود</th><th className="p-3">الإدارة</th><th className="p-3">الشركة</th><th className="p-3">المحطة</th><th className="p-3">الحالة</th><th className="p-3">الإجراء</th></tr></thead>
                <tbody>{departments.map(d => <tr key={d._id} className="border-t border-slate-100">
                  <td className="p-3 font-semibold">{d.code}</td>
                  <td className="p-3">{editingDepartmentId === d._id ? <input className={fieldClass} value={editName} onChange={e => setEditName(e.target.value)} /> : d.name}</td>
                  <td className="p-3">{companies?.find(c => c._id === d.companyId)?.name ?? "—"}</td>
                  <td className="p-3">{stations?.find(s => s._id === d.stationId)?.name ?? "مركزية"}</td>
                  <td className="p-3">{d.status === "active" ? "نشطة" : "متوقفة"}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-2">
                    {editingDepartmentId === d._id ? <><button className={buttonClass} onClick={() => void saveDepartment(d._id)} disabled={busy}>حفظ</button><button className={secondaryButtonClass} onClick={() => setEditingDepartmentId(null)}>إلغاء</button></> : <><button className={secondaryButtonClass} onClick={() => { setEditingDepartmentId(d._id); setEditName(d.name); }}>تعديل</button><button className={secondaryButtonClass} onClick={() => void changeDepartmentStatus(d._id, d.status === "active" ? "inactive" : "active")} disabled={busy}>{d.status === "active" ? "إيقاف" : "تفعيل"}</button></>}
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-bold">المسميات والوظائف</h2>
            <span className="text-xs text-slate-500">{jobTitles?.length ?? 0} وظيفة</span>
          </div>
          {!jobTitles ? <p className="text-sm text-slate-500">جارٍ تحميل الوظائف...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-right text-sm">
                <thead className="bg-slate-100 text-slate-600"><tr><th className="p-3">الكود</th><th className="p-3">المسمى الوظيفي</th><th className="p-3">الإدارة</th><th className="p-3">الدرجة</th><th className="p-3">الحالة</th><th className="p-3">الإجراء</th></tr></thead>
                <tbody>{jobTitles.map(j => <tr key={j._id} className="border-t border-slate-100">
                  <td className="p-3 font-semibold">{j.code}</td>
                  <td className="p-3">{editingJobId === j._id ? <input className={fieldClass} value={editName} onChange={e => setEditName(e.target.value)} /> : j.name}</td>
                  <td className="p-3">{departments?.find(d => d._id === j.departmentId)?.name ?? "عام"}</td>
                  <td className="p-3">{j.grade ?? "—"}</td>
                  <td className="p-3">{j.status === "active" ? "نشطة" : "متوقفة"}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-2">
                    {editingJobId === j._id ? <><button className={buttonClass} onClick={() => void saveJob(j._id)} disabled={busy}>حفظ</button><button className={secondaryButtonClass} onClick={() => setEditingJobId(null)}>إلغاء</button></> : <><button className={secondaryButtonClass} onClick={() => { setEditingJobId(j._id); setEditName(j.name); }}>تعديل</button><button className={secondaryButtonClass} onClick={() => void changeJobStatus(j._id, j.status === "active" ? "inactive" : "active")} disabled={busy}>{j.status === "active" ? "إيقاف" : "تفعيل"}</button></>}
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
