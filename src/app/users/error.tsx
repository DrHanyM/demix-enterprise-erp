"use client";

import { useEffect } from "react";

export default function UsersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("DEMIX users page failed:", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <section className="w-full max-w-2xl rounded-2xl border border-red-900 bg-slate-900 p-8">
        <h1 className="text-2xl font-bold">تعذر تحميل إدارة المستخدمين</h1>
        <p className="mt-3 text-slate-300">
          فشل تحميل بيانات الصفحة أو التحقق من صلاحية الوصول. لم يتم تعديل أي بيانات.
        </p>
        <p className="mt-4 break-words rounded-lg bg-slate-950 p-3 text-sm text-red-300" dir="ltr">
          {error.message || "UNKNOWN_PAGE_ERROR"}
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-slate-500" dir="ltr">Reference: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500"
        >
          إعادة المحاولة
        </button>
      </section>
    </main>
  );
}
