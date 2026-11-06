"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";

type BootstrapResult = {
  success: boolean;
  permissionsCount: number;
  permissionCodes: string[];
};

export default function BootstrapClient() {
  const bootstrap = useAction(api.bootstrapAction.bootstrapFirstCentralAdmin);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BootstrapResult | null>(null);
  const [error, setError] = useState("");

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
          لا تضغط على الزر أكثر من مرة. عملية التهيئة تُنفّذ مرة واحدة فقط،
          وتُرفض تلقائيًا إذا سبق إنشاء بيانات المستخدمين أو الأدوار.
        </div>

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
