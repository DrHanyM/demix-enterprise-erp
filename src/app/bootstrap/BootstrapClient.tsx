"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";

type BootstrapResult = {
  success: boolean;
  permissionsCount: number;
  permissionCodes: string[];
};

type TableCount = { count: number; capped: boolean };

type IdentityCheck = {
  authenticated: boolean;
  hasEmail: boolean;
  hasName: boolean;
  subjectMatchesAllowlist: boolean;
  dataCounts: {
    users: TableCount;
    roles: TableCount;
    permissions: TableCount;
    centralUserRoles: TableCount;
  } | null;
};

function formatCount(value: TableCount) {
  return value.capped ? `${value.count}+` : String(value.count);
}

export default function BootstrapClient() {
  const bootstrap = useAction(api.bootstrapAction.bootstrapFirstCentralAdmin);
  const inspectIdentity = useAction(api.bootstrapAction.inspectBootstrapIdentity);

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [identityCheck, setIdentityCheck] = useState<IdentityCheck | null>(null);
  const [result, setResult] = useState<BootstrapResult | null>(null);
  const [error, setError] = useState("");
  const [checkError, setCheckError] = useState("");

  async function handleIdentityCheck() {
    if (checking) return;

    setChecking(true);
    setCheckError("");
    setIdentityCheck(null);

    try {
      const response = (await inspectIdentity({})) as IdentityCheck;
      setIdentityCheck(response);
    } catch {
      setCheckError("تعذر إجراء اختبار الهوية. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setChecking(false);
    }
  }

  async function handleBootstrap() {
    if (loading || result?.success) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = (await bootstrap({})) as BootstrapResult;
      setResult(response);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "حدث خطأ غير متوقع.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 text-slate-900"
    >
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-bold tracking-wide text-teal-700">
            DEMIX ENTERPRISE ERP
          </p>
          <h1 className="mt-2 text-2xl font-extrabold">
            تهيئة المدير المركزي الأول
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            هذه الصفحة مخصصة لإنشاء حساب المدير المركزي الأول في بيئة Preview.
            يتحقق الخادم من هوية حساب Clerk المصرح له قبل تنفيذ أي تغيير.
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
          لا تضغط على زر التهيئة أكثر من مرة. عملية التهيئة تُنفّذ مرة واحدة فقط،
          وتُرفض تلقائيًا إذا سبق إنشاء بيانات المستخدمين أو الأدوار.
        </div>

        <button
          type="button"
          onClick={handleIdentityCheck}
          disabled={checking}
          className="mt-6 w-full rounded-xl border border-teal-700 px-5 py-3 text-sm font-bold text-teal-800 transition hover:bg-teal-50 disabled:opacity-60"
        >
          {checking ? "جارٍ اختبار الاتصال والهوية..." : "اختبار الاتصال والهوية"}
        </button>

        {identityCheck && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-8">
            <p>الاتصال موثّق: {identityCheck.authenticated ? "نعم" : "لا"}</p>
            <p>البريد موجود: {identityCheck.hasEmail ? "نعم" : "لا"}</p>
            <p>الاسم موجود: {identityCheck.hasName ? "نعم" : "لا"}</p>
            <p>
              الحساب مصرح له: {identityCheck.subjectMatchesAllowlist ? "نعم" : "لا"}
            </p>
            {identityCheck.dataCounts && (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="font-bold">فحص قاعدة بيانات Preview (قراءة فقط)</p>
                <p>المستخدمون (users): {formatCount(identityCheck.dataCounts.users)}</p>
                <p>الأدوار (roles): {formatCount(identityCheck.dataCounts.roles)}</p>
                <p>الصلاحيات (permissions): {formatCount(identityCheck.dataCounts.permissions)}</p>
                <p>ربط المديرين بالأدوار (centralUserRoles): {formatCount(identityCheck.dataCounts.centralUserRoles)}</p>
                <p className="mt-2 text-xs text-slate-500">الفحص لا يعرض بيانات شخصية ولا يغيّر أي سجل. علامة + تعني أن العدد تجاوز 1000.</p>
              </div>
            )}
          </div>
        )}

        {checkError && (
          <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
            {checkError}
          </div>
        )}

        <button
          type="button"
          onClick={handleBootstrap}
          disabled={loading || result?.success === true}
          className="mt-6 w-full rounded-xl bg-[#172b4d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#243e68] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? "جارٍ تنفيذ التهيئة..."
            : result?.success
              ? "تم إنشاء المدير المركزي"
              : "إنشاء المدير المركزي الأول"}
        </button>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-7 text-rose-800"
          >
            <p className="font-bold">تعذر تنفيذ التهيئة</p>
            <p className="mt-1 break-words">{error}</p>
          </div>
        )}

        {result?.success && (
          <div
            role="status"
            className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-900"
          >
            <p className="font-bold">اكتملت تهيئة المدير المركزي بنجاح.</p>
            <p className="mt-1">
              عدد الصلاحيات التي تم إعدادها: {result.permissionsCount}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
