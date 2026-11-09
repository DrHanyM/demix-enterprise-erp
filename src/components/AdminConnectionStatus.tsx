"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function AdminConnectionStatus() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const report = useQuery(
    api.adminStatus.verifyCentralAdmin,
    isAuthenticated ? {} : "skip"
  );

  if (authLoading) {
    return (
      <section
        dir="rtl"
        className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"
        aria-live="polite"
      >
        جارٍ التحقق من جلسة الدخول والاتصال بقاعدة البيانات...
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section
        dir="rtl"
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        role="status"
      >
        لم يتم تأكيد جلسة المصادقة مع Convex. سجّل الدخول ثم أعد تحميل الصفحة.
      </section>
    );
  }

  if (report === undefined) {
    return (
      <section
        dir="rtl"
        className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"
        aria-live="polite"
      >
        تم تسجيل الدخول. جارٍ تحميل حالة المستخدم والصلاحيات من Convex...
      </section>
    );
  }

  if (!report.verified) {
    return (
      <section
        dir="rtl"
        className="rounded-xl border border-amber-200 bg-amber-50 p-4"
        role="status"
      >
        <div className="font-bold text-amber-900">
          المصادقة تعمل، لكن اعتماد المدير المركزي غير مكتمل
        </div>
        <p className="mt-1 text-sm text-amber-800">
          {"message" in report
            ? report.message
            : "لم تجتز بيانات المستخدم أو الدور أو سجل التهيئة جميع فحوص الاعتماد."}
        </p>
        {"user" in report && report.user && (
          <div className="mt-3 grid gap-2 text-xs text-amber-900 sm:grid-cols-3">
            <div>المستخدم: {report.user.fullName}</div>
            <div>الدور: {report.role?.code ?? "غير معيّن"}</div>
            <div>الصلاحيات: {report.permissionsCount}/13</div>
            <div>حالة الحساب: {report.user.status}</div>
            <div>سجل التهيئة: {report.auditLogExists ? "موجود" : "غير موجود"}</div>
          </div>
        )}
      </section>
    );
  }

  if (!("user" in report) || !report.user) {
    return (
      <section
        dir="rtl"
        className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        role="alert"
      >
        تعذر استكمال تقرير اعتماد المدير المركزي. راجع سجل Convex قبل منح أي صلاحيات.
      </section>
    );
  }

  return (
    <section
      dir="rtl"
      className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"
      role="status"
    >
      <div className="font-bold text-emerald-900">
        اكتمل التحقق من Clerk وConvex واعتماد المدير المركزي
      </div>
      <div className="mt-2 grid gap-2 text-xs text-emerald-900 sm:grid-cols-3">
        <div>المستخدم: {report.user.fullName}</div>
        <div>البريد: {report.user.email}</div>
        <div>الدور: {report.role?.name ?? report.role?.code ?? "غير محدد"}</div>
        <div>الصلاحيات: {report.permissionsCount}/13</div>
        <div>سجل التهيئة: موجود</div>
        <div>حالة الحساب: {report.user.status}</div>
      </div>
    </section>
  );
}
