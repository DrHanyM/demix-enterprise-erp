"use client";

import BackToDashboard from "@/components/BackToDashboard";
import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type EmploymentType = "permanent" | "contract" | "temporary" | "daily";
type EmployeeStatus = "active" | "inactive" | "on_leave" | "terminated";
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500";
const primaryButton = "rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const quietButton = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50";

export default function HrEmployeesPage() {
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
  const jobs = useQuery(api.hrCore.listJobTitles, accessReady ? {} : "skip");
  const employees = useQuery(api.hrCore.listEmployees, accessReady ? {} : "skip");
  const stations = useQuery(api.stations.listStations, accessReady ? {} : "skip");

  const createEmployee = useMutation(api.hrCore.createEmployee);
  const updateEmployee = useMutation(api.hrCore.updateEmployee);

  const [employeeNo, setEmployeeNo] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [stationId, setStationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [jobTitleId, setJobTitleId] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("permanent");
  const [hireDate, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [editingId, setEditingId] = useState<Id<"employees"> | null>(null);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedDepartment = departments?.find(d => d._id === departmentId);
  const availableDepartments = (departments ?? []).filter(d => d.status === "active" && (!companyId || d.companyId === companyId));
  const availableJobs = (jobs ?? []).filter(j => j.status === "active" && (!j.departmentId || j.departmentId === departmentId));

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (employees ?? []).filter(employee => {
      const matchesText = employee.employeeNo.toLocaleLowerCase().includes(term) || employee.fullName.toLocaleLowerCase().includes(term);
      const matchesCompany = !companyFilter || employee.companyId === companyFilter;
      const matchesStatus = statusFilter === "all" || employee.status === statusFilter;
      return matchesText && matchesCompany && matchesStatus;
    });
  }, [employees, search, companyFilter, statusFilter]);

  function resetForm() {
    setEditingId(null);
    setEmployeeNo("");
    setFullName("");
    setCompanyId("");
    setStationId("");
    setDepartmentId("");
    setJobTitleId("");
    setEmploymentType("permanent");
    setHireDate(new Date().toISOString().slice(0, 10));
    setMobile("");
    setEmail("");
  }

  function startEdit(employee: NonNullable<typeof employees>[number]) {
    setEditingId(employee._id);
    setEmployeeNo(employee.employeeNo);
    setFullName(employee.fullName);
    setCompanyId(employee.companyId);
    setStationId(employee.stationId ?? "");
    setDepartmentId(employee.departmentId);
    setJobTitleId(employee.jobTitleId);
    setHireDate(employee.hireDate);
    setMobile(employee.mobile ?? "");
    setEmail(employee.email ?? "");
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave() {
    if (!fullName.trim() || !companyId || !departmentId || !jobTitleId) {
      setError("أكمل الاسم والشركة والإدارة والمسمى الوظيفي.");
      return;
    }
    if (!editingId && !employeeNo.trim()) {
      setError("أدخل الرقم الوظيفي.");
      return;
    }
    setBusy(true);
    setNotice("");
    setError("");
    try {
      if (editingId) {
        await updateEmployee({
          employeeId: editingId,
          fullName: fullName.trim(),
          mobile: mobile.trim() || undefined,
          email: email.trim() || undefined,
          stationId: stationId ? stationId as Id<"stations"> : undefined,
          departmentId: departmentId as Id<"departments">,
          jobTitleId: jobTitleId as Id<"jobTitles">,
          operationId: "hr-employee-update-" + crypto.randomUUID(),
        });
        setNotice("تم تحديث ملف الموظف.");
      } else {
        await createEmployee({
          employeeNo: employeeNo.trim(),
          fullName: fullName.trim(),
          companyId: companyId as Id<"companies">,
          stationId: stationId ? stationId as Id<"stations"> : undefined,
          departmentId: departmentId as Id<"departments">,
          jobTitleId: jobTitleId as Id<"jobTitles">,
          employmentType,
          hireDate,
          mobile: mobile.trim() || undefined,
          email: email.trim() || undefined,
          operationId: "hr-employee-create-" + crypto.randomUUID(),
        });
        setNotice("تم إنشاء ملف الموظف بنجاح.");
      }
      resetForm();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ ملف الموظف.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(employeeId: Id<"employees">, status: EmployeeStatus) {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await updateEmployee({
        employeeId,
        status,
        operationId: "hr-employee-status-" + crypto.randomUUID(),
      });
      setNotice("تم تحديث حالة الموظف.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحديث حالة الموظف.");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel: Record<EmployeeStatus, string> = {
    active: "على رأس العمل",
    inactive: "غير نشط",
    on_leave: "إجازة",
    terminated: "منتهي الخدمة",
  };
  const employmentLabel: Record<EmploymentType, string> = {
    permanent: "دائم",
    contract: "عقد",
    temporary: "مؤقت",
    daily: "يومية",
  };

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-teal-700">DEMIX ENTERPRISE ERP / HR</p>
            <h1 className="mt-2 text-2xl font-extrabold">ملفات الموظفين</h1>
            <p className="mt-2 text-sm text-slate-500">إنشاء الملفات الوظيفية وربط الموظف بالشركة والمحطة والإدارة والوظيفة.</p>
          </div>
          <BackToDashboard />
        </header>

        {bootstrapError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">تعذر تهيئة صلاحيات الوصول: {bootstrapError}</div>}

        {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
        {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">{editingId ? "تعديل ملف موظف" : "إضافة موظف جديد"}</h2>
              <p className="mt-1 text-xs text-slate-500">الحقول الأساسية للملف الوظيفي. الرقم الوظيفي لا يتغير بعد الإنشاء.</p>
            </div>
            {editingId && <button className={quietButton} onClick={resetForm}>إلغاء التعديل</button>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              الرقم الوظيفي
              <input className={inputClass} value={employeeNo} onChange={e => setEmployeeNo(e.target.value)} placeholder="EMP-0001" disabled={busy || !!editingId} maxLength={40} />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              اسم الموظف
              <input className={inputClass} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="الاسم بالكامل" disabled={busy} />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              الشركة
              <select className={inputClass} value={companyId} onChange={e => { setCompanyId(e.target.value); setDepartmentId(""); setJobTitleId(""); setStationId(""); }} disabled={busy || !!editingId}>
                <option value="">اختر الشركة</option>
                {(companies ?? []).filter(c => c.status === "active").map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              الإدارة / القسم
              <select className={inputClass} value={departmentId} onChange={e => { setDepartmentId(e.target.value); setJobTitleId(""); setStationId(""); }} disabled={busy || !companyId}>
                <option value="">اختر الإدارة</option>
                {availableDepartments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              المسمى الوظيفي
              <select className={inputClass} value={jobTitleId} onChange={e => setJobTitleId(e.target.value)} disabled={busy || !departmentId}>
                <option value="">اختر الوظيفة</option>
                {availableJobs.map(j => <option key={j._id} value={j._id}>{j.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              المحطة
              <select className={inputClass} value={stationId} onChange={e => setStationId(e.target.value)} disabled={busy}>
                <option value="">تلقائي حسب الإدارة / مركزي</option>
                {(stations ?? []).filter(s => s.status === "active").map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
              {selectedDepartment?.stationId && <span className="block font-normal text-slate-400">ستُربط تلقائيًا بمحطة الإدارة ما لم تختر المحطة نفسها.</span>}
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              نوع التوظيف
              <select className={inputClass} value={employmentType} onChange={e => setEmploymentType(e.target.value as EmploymentType)} disabled={busy || !!editingId}>
                <option value="permanent">دائم</option><option value="contract">عقد</option><option value="temporary">مؤقت</option><option value="daily">يومية</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              تاريخ التعيين
              <input type="date" className={inputClass} value={hireDate} onChange={e => setHireDate(e.target.value)} disabled={busy || !!editingId} />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              رقم الهاتف
              <input className={inputClass} value={mobile} onChange={e => setMobile(e.target.value)} placeholder="رقم الهاتف" disabled={busy} />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              البريد الإلكتروني
              <input type="email" className={inputClass} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" disabled={busy} />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className={primaryButton} onClick={() => void handleSave()} disabled={busy}>{busy ? "جارٍ الحفظ..." : editingId ? "حفظ التعديلات" : "إنشاء ملف الموظف"}</button>
            {!editingId && <button className={quietButton} onClick={resetForm} disabled={busy}>مسح الحقول</button>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold">سجل الموظفين</h2>
            <span className="text-xs text-slate-500">{filteredEmployees.length} سجل</span>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <input className={inputClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالرقم الوظيفي أو الاسم..." />
            <select className={inputClass} value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
              <option value="">كل الشركات</option>
              {(companies ?? []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <select className={inputClass} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">كل الحالات</option><option value="active">على رأس العمل</option><option value="inactive">غير نشط</option><option value="on_leave">إجازة</option><option value="terminated">منتهي الخدمة</option>
            </select>
          </div>
          {!employees ? <p className="text-sm text-slate-500">جارٍ تحميل ملفات الموظفين...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-right text-sm">
                <thead className="bg-slate-100 text-slate-600"><tr><th className="p-3">الرقم</th><th className="p-3">اسم الموظف</th><th className="p-3">الشركة</th><th className="p-3">المحطة</th><th className="p-3">الإدارة</th><th className="p-3">الوظيفة</th><th className="p-3">نوع التوظيف</th><th className="p-3">الحالة</th><th className="p-3">الإجراء</th></tr></thead>
                <tbody>{filteredEmployees.map(employee => <tr key={employee._id} className="border-t border-slate-100">
                  <td className="p-3 font-semibold">{employee.employeeNo}</td>
                  <td className="p-3">{employee.fullName}</td>
                  <td className="p-3">{companies?.find(c => c._id === employee.companyId)?.name ?? "—"}</td>
                  <td className="p-3">{stations?.find(s => s._id === employee.stationId)?.name ?? "مركزي"}</td>
                  <td className="p-3">{departments?.find(d => d._id === employee.departmentId)?.name ?? "—"}</td>
                  <td className="p-3">{jobs?.find(j => j._id === employee.jobTitleId)?.name ?? "—"}</td>
                  <td className="p-3">{employmentLabel[employee.employmentType]}</td>
                  <td className="p-3">{statusLabel[employee.status]}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-2">
                    <button className={quietButton} onClick={() => startEdit(employee)} disabled={busy}>تعديل</button>
                    <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs" value={employee.status} disabled={busy} onChange={e => void changeStatus(employee._id, e.target.value as EmployeeStatus)}>
                      <option value="active">على رأس العمل</option><option value="inactive">غير نشط</option><option value="on_leave">إجازة</option><option value="terminated">إنهاء الخدمة</option>
                    </select>
                  </div></td>
                </tr>)}</tbody>
              </table>
              {filteredEmployees.length === 0 && <p className="py-8 text-center text-sm text-slate-500">لا توجد سجلات مطابقة.</p>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
