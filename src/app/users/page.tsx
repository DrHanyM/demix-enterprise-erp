
"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type InvitationStatus =
  | "inviting"
  | "invited"
  | "accepted"
  | "expired"
  | "revoked"
  | "failed";

export default function UsersPage() {
  // Convex authentication can finish after Clerk authentication. Do not run
  // protected queries until Convex has accepted the Clerk session token.
  const { isLoaded: isClerkLoaded, isSignedIn, getToken } = useAuth();
  const { isLoading: isConvexAuthLoading, isAuthenticated } = useConvexAuth();
  const [authDiagnostic, setAuthDiagnostic] = useState<{
    status: string;
    issuer?: string;
    audience?: string;
    error?: string;
  }>({ status: "لم يبدأ الفحص بعد" });
  const canManageUsers = useQuery(api.users.canManageUsers, isAuthenticated ? {} : "skip");
  const hasUserManagementAccess = isAuthenticated && canManageUsers === true;
  const data = useQuery(api.users.listUsers, hasUserManagementAccess ? {} : "skip");
  const invitations = useQuery(api.invitations.listInvitations, hasUserManagementAccess ? {} : "skip");
  const stations = useQuery(api.stations.listStations, hasUserManagementAccess ? {} : "skip");

  const createInvitationDraft = useMutation(
    api.invitations.createInvitationDraft
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const accessDetails = useQuery(
    api.users.getUserAccessDetails,
    hasUserManagementAccess && selectedUserId ? { userId: selectedUserId } : "skip"
  );

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [stationIds, setStationIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );

  useEffect(() => {
    let cancelled = false;

    async function inspectAuthentication() {
      if (!isClerkLoaded) {
        setAuthDiagnostic({ status: "Clerk لم يكتمل تحميله بعد" });
        return;
      }
      if (!isSignedIn) {
        setAuthDiagnostic({ status: "لا توجد جلسة دخول نشطة في Clerk" });
        return;
      }

      try {
        const token = await getToken({ template: "convex" });
        if (!token) {
          if (!cancelled) setAuthDiagnostic({ status: "Clerk لم يُصدر JWT باسم convex (التوكن فارغ)" });
          return;
        }

        const payloadPart = token.split(".")[1];
        if (!payloadPart) throw new Error("صيغة JWT غير صحيحة");
        const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as { iss?: string; aud?: string | string[] };

        if (!cancelled) {
          setAuthDiagnostic({
            status: "تم إصدار JWT من Clerk بنجاح",
            issuer: payload.iss,
            audience: Array.isArray(payload.aud) ? payload.aud.join(", ") : payload.aud,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setAuthDiagnostic({
            status: "فشل طلب JWT من Clerk",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    void inspectAuthentication();
    return () => { cancelled = true; };
  }, [isClerkLoaded, isSignedIn, getToken]);

  const users = data?.users ?? [];
  const invitationList = invitations ?? [];

  useEffect(() => {
    if (stations && stationIds.length === 0) {
      const defaults = stations.filter((station) => station.name === "أبو رواش" || station.name === "أبو قير").map((station) => station._id);
      if (defaults.length > 0) setStationIds(defaults);
    }
  }, [stations, stationIds.length]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        user.fullName.toLocaleLowerCase().includes(term) ||
        user.email.toLocaleLowerCase().includes(term);

      const matchesStatus =
        statusFilter === "all" || user.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [users, search, statusFilter]);

  function formatDate(timestamp?: number) {
    if (!timestamp) return "—";

    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  }

  const statusLabels: Record<string, string> = {
    active: "نشط",
    invited: "بانتظار الدعوة",
    suspended: "موقوف",
  };

  const invitationStatusLabels: Record<InvitationStatus, string> = {
    inviting: "جارٍ تجهيز الدعوة",
    invited: "بانتظار قبول الدعوة",
    accepted: "تم قبول الدعوة",
    expired: "انتهت صلاحية الدعوة",
    revoked: "تم إلغاء الدعوة",
    failed: "فشل الإرسال",
  };

  function showMessage(
    text: string,
    type: "success" | "error"
  ) {
    setMessage(text);
    setMessageType(type);
  }

  async function handleCreateInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (sending) return;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = fullName.trim();

    if (!normalizedName || !normalizedEmail || stationIds.length === 0) {
      showMessage("يرجى إدخال الاسم والبريد الإلكتروني واختيار محطة واحدة على الأقل.", "error");
      return;
    }

    setSending(true);
    setMessage("");

    let invitationId: string | undefined;

    try {
      // إنشاء سجل الدعوة أولاً داخل Convex
      const operationId = crypto.randomUUID();

      const draft = await createInvitationDraft({
        email: normalizedEmail,
        fullName: normalizedName,
        stationIds: stationIds as Id<"stations">[],
        operationId,
      });

      invitationId = draft.invitationId;

      if (!invitationId) {
        throw new Error("تعذر إنشاء سجل الدعوة.");
      }

      // إرسال الدعوة عبر Clerk باستخدام سجل Convex الحقيقي
      const response = await fetch("/api/invitations/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invitationId,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        if (result?.error === "INVITATION_CREATED_BUT_NOT_RECORDED") {
          throw new Error(
            "أنشأ Clerk الدعوة، لكن تعذر تسجيلها في Convex. لا تعاود الإرسال قبل مراجعة الحالة."
          );
        }

        if (response.status === 404) {
          throw new Error("سجل الدعوة غير موجود.");
        }

        if (response.status === 401) {
          throw new Error("انتهت جلسة الدخول أو لا توجد صلاحية للمستخدم.");
        }

        throw new Error(
          result?.message ||
            result?.error ||
            "تعذر إرسال الدعوة. راجع سجل الخادم."
        );
      }

      showMessage(
        `تم إرسال الدعوة بنجاح إلى ${normalizedEmail}.`,
        "success"
      );

      setEmail("");
      setFullName("");
    } catch (error) {
      console.error("Invitation creation error:", {
        invitationId,
        error,
      });

      const errorMessage =
        error instanceof Error
          ? error.message
          : "حدث خطأ غير متوقع أثناء إنشاء الدعوة.";

      showMessage(errorMessage, "error");
    } finally {
      setSending(false);
    }
  }

  if (isConvexAuthLoading) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-950 p-8 text-white">
        <p>جارٍ التحقق من جلسة الدخول مع Convex...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-950 p-8 text-white">
        <h1 className="text-xl font-bold">تعذر توثيق الجلسة مع قاعدة البيانات</h1>
        <p className="mt-2 text-slate-300">نتيجة فحص الاتصال:</p>
        <div className="mt-4 max-w-2xl space-y-2 rounded-xl border border-amber-700 bg-slate-900 p-4 text-sm">
          <p>Clerk: {isClerkLoaded ? (isSignedIn ? "تم تحميله – المستخدم مسجل الدخول" : "تم تحميله – لا توجد جلسة") : "جارٍ التحميل"}</p>
          <p>Convex: {isConvexAuthLoading ? "جارٍ التحقق" : isAuthenticated ? "موثق" : "لم يقبل جلسة المصادقة"}</p>
          <p>JWT: {authDiagnostic.status}</p>
          {authDiagnostic.issuer && <p className="break-all">Issuer: {authDiagnostic.issuer}</p>}
          {authDiagnostic.audience && <p>Audience: {authDiagnostic.audience}</p>}
          {authDiagnostic.error && <p className="break-words text-red-300">التفصيل: {authDiagnostic.error}</p>}
        </div>
        <p className="mt-4 text-slate-400">هذا الفحص لا يعرض التوكن ولا يغير أي بيانات أو صلاحيات. أرسل صورة هذه النتيجة لتحديد موضع الخلل.</p>
      </main>
    );
  }

  if (canManageUsers === false) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-950 p-8 text-white">
        <section className="mx-auto max-w-xl rounded-2xl border border-amber-700/60 bg-slate-900 p-6" role="status" aria-live="polite">
          <h1 className="text-xl font-bold">ليس لديك صلاحية الوصول إلى إدارة المستخدمين</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            حسابك مخصص لتشغيل الإنتاج في المحطات المصرح بها. لا تتطلب مهامك الوصول إلى إدارة الحسابات أو الدعوات.
          </p>
          <p className="mt-3 text-sm text-slate-400">
            إذا كنت تحتاج إلى هذه الصفحة لأداء مهمة إدارية، تواصل مع مدير النظام.
          </p>
          <a href="/" className="mt-5 inline-flex rounded-lg bg-teal-400 px-4 py-2 text-sm font-bold text-slate-950">
            العودة إلى لوحة التحكم
          </a>
        </section>
      </main>
    );
  }

  if (canManageUsers === undefined) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-950 p-8 text-white">
        <p>جارٍ التحقق من صلاحية الوصول إلى إدارة المستخدمين...</p>
      </main>
    );
  }

  if (data === undefined) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-950 p-8 text-white">
        <p>جارٍ تحميل بيانات المستخدمين...</p>
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-950 p-6 text-white md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">

        <header>
          <p className="text-sm text-blue-400">
            DEMIX ENTERPRISE ERP
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            إدارة المستخدمين
          </h1>
          <p className="mt-2 text-slate-400">
            إدارة حسابات المستخدمين ودعوات الانضمام إلى النظام.
          </p>
        </header>

        {/* إحصاءات المستخدمين */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">إجمالي المستخدمين</p>
            <p className="mt-2 text-3xl font-bold">{data.total}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">المستخدمون النشطون</p>
            <p className="mt-2 text-3xl font-bold text-emerald-400">
              {users.filter((user) => user.status === "active").length}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">الحسابات الموقوفة</p>
            <p className="mt-2 text-3xl font-bold text-red-400">
              {users.filter((user) => user.status === "suspended").length}
            </p>
          </div>
        </section>

        {/* إنشاء دعوة */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-5">
            <h2 className="text-xl font-bold">إنشاء دعوة مستخدم جديد</h2>
            <p className="mt-2 text-sm text-slate-400">
              أدخل بيانات الشخص المراد دعوته. لن يصبح الحساب نشطاً إلا بعد قبول الدعوة والتحقق من الحساب.
            </p>
          </div>

          <form onSubmit={handleCreateInvitation} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  الاسم بالكامل
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="أدخل الاسم بالكامل"
                  maxLength={120}
                  required
                  disabled={sending}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  maxLength={254}
                  required
                  disabled={sending}
                  dir="ltr"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-left text-white outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
            </div>


            <fieldset className="rounded-lg border border-slate-700 p-4">
              <legend className="px-2 text-sm font-semibold text-slate-200">محطات المستخدم المصرح بها</legend>
              <p className="mb-3 text-xs text-slate-400">سيُربط دور مشغل الإنتاج بالمحطات المحددة فقط.</p>
              {stations === undefined ? (
                <p className="text-sm text-slate-400">جارٍ تحميل المحطات...</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {stations.filter((station) => station.status === "active").map((station) => (
                    <label key={station._id} className="flex cursor-pointer items-center gap-3 rounded-lg bg-slate-950 p-3 text-sm">
                      <input type="checkbox" checked={stationIds.includes(station._id)} disabled={sending}
                        onChange={(event) => setStationIds((current) => event.target.checked ? [...current, station._id] : current.filter((id) => id !== station._id))}
                        className="h-4 w-4 accent-blue-500" />
                      <span>{station.name} <span className="text-xs text-slate-500">({station.code})</span></span>
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-blue-300">المحدد: {stationIds.length} محطة</p>
            </fieldset>
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "جارٍ إنشاء وإرسال الدعوة..." : "إنشاء وإرسال الدعوة"}
            </button>
          </form>

          {message && (
            <div
              role="status"
              className={`mt-5 rounded-lg border p-4 text-sm ${
                messageType === "success"
                  ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
                  : "border-red-700 bg-red-950/40 text-red-300"
              }`}
            >
              {message}
            </div>
          )}
        </section>

        {/* سجل الدعوات */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">سجل الدعوات</h2>
              <p className="mt-1 text-sm text-slate-400">
                متابعة حالة الدعوات المرسلة وقبول المستخدمين.
              </p>
            </div>

            <span className="rounded-lg bg-slate-800 px-4 py-2 text-sm">
              إجمالي الدعوات: {invitationList.length}
            </span>
          </div>

          {invitations === undefined ? (
            <p className="py-6 text-center text-slate-400">
              جارٍ تحميل الدعوات...
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-right text-sm">
                <thead className="border-b border-slate-700 text-slate-400">
                  <tr>
                    <th className="px-4 py-4">الاسم</th>
                    <th className="px-4 py-4">البريد الإلكتروني</th>
                    <th className="px-4 py-4">الحالة</th>
                    <th className="px-4 py-4">تاريخ الإنشاء</th>
                    <th className="px-4 py-4">تاريخ الإرسال</th>
                    <th className="px-4 py-4">تاريخ الانتهاء</th>
                  </tr>
                </thead>

                <tbody>
                  {invitationList.map((invitation) => {
                    const status =
                      invitation.status as InvitationStatus;

                    const statusStyle =
                      status === "accepted"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : status === "invited"
                          ? "bg-amber-500/10 text-amber-400"
                          : status === "failed"
                            ? "bg-red-500/10 text-red-400"
                            : status === "revoked" ||
                                status === "expired"
                              ? "bg-slate-700 text-slate-300"
                              : "bg-blue-500/10 text-blue-400";

                    return (
                      <tr
                        key={invitation.id}
                        className="border-b border-slate-800"
                      >
                        <td className="px-4 py-4 font-medium">
                          {invitation.fullName}
                          <p className="mt-1 text-xs font-normal text-slate-400">
                            {(invitation.stationIds ?? []).map((stationId) =>
                              stations?.find((station) => station._id === stationId)?.name ?? "محطة غير معروفة"
                            ).join("، ") || "لم تُحدد محطة"}
                          </p>
                        </td>

                        <td
                          className="px-4 py-4 text-slate-300"
                          dir="ltr"
                        >
                          {invitation.email}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-3 py-1 ${statusStyle}`}
                          >
                            {invitationStatusLabels[status] ?? status}
                          </span>

                          {invitation.failureReason && (
                            <p className="mt-2 max-w-xs text-xs text-red-400">
                              {invitation.failureReason}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-4 text-slate-300">
                          {formatDate(invitation.createdAt)}
                        </td>

                        <td className="px-4 py-4 text-slate-300">
                          {formatDate(invitation.invitedAt)}
                        </td>

                        <td className="px-4 py-4 text-slate-300">
                          {formatDate(invitation.expiresAt)}
                        </td>
                      </tr>
                    );
                  })}

                  {invitationList.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-slate-400"
                      >
                        لا توجد دعوات مسجلة حتى الآن.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* المستخدمون المسجلون */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-5 text-xl font-bold">
            حسابات المستخدمين المسجلة
          </h2>

          <div className="mb-5 flex flex-col gap-3 md:flex-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="البحث بالاسم أو البريد الإلكتروني..."
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white"
            >
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="invited">بانتظار الدعوة</option>
              <option value="suspended">موقوف</option>
            </select>
          </div>

          <div className="mb-4 text-sm text-slate-400">
            نتائج البحث: {filteredUsers.length} من {data.total}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-right text-sm">
              <thead className="border-b border-slate-700 text-slate-400">
                <tr>
                  <th className="px-4 py-4">الاسم</th>
                  <th className="px-4 py-4">البريد الإلكتروني</th>
                  <th className="px-4 py-4">الحالة</th>
                  <th className="px-4 py-4">تاريخ الإنشاء</th>
                  <th className="px-4 py-4">آخر تحديث</th>
                  <th className="px-4 py-4">تفاصيل الوصول</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-slate-800">
                    <td className="px-4 py-4 font-medium">
                      {user.fullName}
                    </td>

                    <td className="px-4 py-4 text-slate-300">
                      {user.email}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={
                          user.status === "active"
                            ? "rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-400"
                            : user.status === "suspended"
                              ? "rounded-full bg-red-500/10 px-3 py-1 text-red-400"
                              : "rounded-full bg-amber-500/10 px-3 py-1 text-amber-400"
                        }
                      >
                        {statusLabels[user.status] ?? user.status}
                      </span>
                    </td>

                    <td className="px-4 py-4 text-slate-300">
                      {formatDate(user.createdAt)}
                    </td>

                    <td className="px-4 py-4 text-slate-300">
                      {formatDate(user.updatedAt)}
                    </td>
                    <td className="px-4 py-4">
                      <button type="button" onClick={() => setSelectedUserId(selectedUserId === user.id ? null : user.id)} aria-expanded={selectedUserId === user.id} className="rounded-lg border border-blue-700 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-950">
                        {selectedUserId === user.id ? "إخفاء التفاصيل" : "عرض الدور والصلاحيات"}
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      لا توجد حسابات مطابقة لعملية البحث.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

          </div>

          {selectedUserId && (
            <section className="mt-6 rounded-xl border border-blue-800/70 bg-slate-950 p-5" aria-live="polite">
              {accessDetails === undefined ? (
                <p className="text-sm text-slate-300">جارٍ تحميل تفاصيل الدور والصلاحيات الفعلية...</p>
              ) : (
                <>
                  <h3 className="text-lg font-bold">تفاصيل الوصول والصلاحيات</h3>
                  <p className="mt-1 text-sm text-slate-400">{accessDetails.user.fullName} — <span dir="ltr">{accessDetails.user.email}</span></p>
                  <div className="mt-5 space-y-5">
                    <div>
                      <h4 className="mb-3 font-semibold text-blue-300">الأدوار والصلاحيات على مستوى المحطات</h4>
                      {accessDetails.stationAssignments.length === 0 ? <p className="text-sm text-amber-300">لا توجد تعيينات محطات مسجلة.</p> : (
                        <div className="grid gap-3 lg:grid-cols-2">
                          {accessDetails.stationAssignments.map((assignment, index) => (
                            <article key={index} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                              <p className="font-semibold">{assignment.station?.name ?? "محطة غير معروفة"} ({assignment.station?.code ?? "—"})</p>
                              <p className="mt-2 text-sm">حالة التعيين: {assignment.assignmentStatus === "active" ? "نشط" : "غير نشط"}</p>
                              <p className="mt-1 text-sm">الدور: {assignment.role?.name ?? "غير محدد"}</p>
                              <p className="mt-1 text-xs text-slate-500" dir="ltr">{assignment.role?.code ?? "NO_ROLE"}</p>
                              <p className="mt-3 text-xs font-semibold text-slate-400">الصلاحيات المرتبطة بالدور:</p>
                              {assignment.permissions.length ? (
                                <ul className="mt-2 space-y-1">
                                  {assignment.permissions.map((permission) => <li key={permission.code} className="text-xs text-emerald-300" dir="ltr">{permission.code}</li>)}
                                </ul>
                              ) : <p className="mt-2 text-xs text-amber-300">لا توجد صلاحيات مرتبطة.</p>}
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="mb-3 font-semibold text-blue-300">الأدوار والصلاحيات المركزية</h4>
                      {accessDetails.centralAssignments.length === 0 ? <p className="text-sm text-slate-400">لا توجد أدوار مركزية.</p> : accessDetails.centralAssignments.map((assignment, index) => (
                        <article key={index} className="mb-2 rounded-lg border border-slate-800 bg-slate-900 p-4">
                          <p className="font-semibold">{assignment.role?.name ?? "دور غير معروف"} ({assignment.role?.code ?? "—"})</p>
                          <p className="mt-1 text-xs text-slate-400">حالة التعيين: {assignment.assignmentStatus === "active" ? "نشط" : "غير نشط"}</p>
                          <ul className="mt-2 space-y-1">{assignment.permissions.map((permission) => <li key={permission.code} className="text-xs" dir="ltr">{permission.code}</li>)}</ul>
                        </article>
                      ))}
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                      <h4 className="font-semibold">فحص صلاحيات الإنتاج</h4>
                      {(() => {
                        const expectedPermissions = ["production.records.read", "production.records.create", "production.records.update"];
                        const activeAssignments = accessDetails.stationAssignments.filter((a) => a.assignmentStatus === "active" && a.station?.status === "active" && a.role?.status === "active");
                        const actualStationCodes = activeAssignments.map((a) => a.station?.code).filter((code): code is string => Boolean(code));
                        const missingStations = ["ST-001", "ST-002"].filter((code) => !actualStationCodes.includes(code));
                        const extraStations = [...new Set(actualStationCodes.filter((code) => !["ST-001", "ST-002"].includes(code)))];
                        const permissionMismatches = activeAssignments.filter((a) => {
                          const codes = a.permissions.map((permission) => permission.code);
                          return expectedPermissions.some((code) => !codes.includes(code)) || codes.some((code) => !expectedPermissions.includes(code));
                        });
                        const activeCentralAssignments = accessDetails.centralAssignments.filter((a) => a.assignmentStatus === "active" && a.role?.status === "active");
                        const activePermissionCodes = [
                          ...activeAssignments.flatMap((a) => a.permissions.map((permission) => permission.code)),
                          ...activeCentralAssignments.flatMap((a) => a.permissions.map((permission) => permission.code)),
                        ];
                        const hasDelete = activePermissionCodes.includes("production.records.delete");
                        const stationsMatch = missingStations.length === 0 && extraStations.length === 0 && actualStationCodes.length === 2;
                        const allChecksPass = stationsMatch && permissionMismatches.length === 0 && activeCentralAssignments.length === 0 && !hasDelete;
                        return (
                          <div className="mt-2 space-y-2 text-sm">
                            <p className={allChecksPass ? "text-emerald-300" : "text-amber-300"}>{allChecksPass ? "مطابقة: أبو رواش وأبو قير فقط، والصلاحيات الثلاث لكل محطة، دون دور مركزي أو حذف." : "توجد نقطة تحتاج مراجعة؛ راجع نتائج الفحص التالية."}</p>
                            <p>المحطات المصرح بها: <span className={stationsMatch ? "text-emerald-300" : "text-amber-300"}>{stationsMatch ? "أبو رواش وأبو قير فقط" : "المحطات لا تطابق المطلوب"}</span></p>
                            {missingStations.length > 0 && <p className="text-amber-300">محطات ناقصة: {missingStations.join("، ")}</p>}
                            {extraStations.length > 0 && <p className="text-amber-300">محطات إضافية: {extraStations.join("، ")}</p>}
                            <p>مجموعة الصلاحيات لكل تعيين محطة: <span className={permissionMismatches.length === 0 && activeAssignments.length === 2 ? "text-emerald-300" : "text-amber-300"}>{permissionMismatches.length === 0 && activeAssignments.length === 2 ? "مطابقة تمامًا (read / create / update)" : "غير مكتملة أو تحتوي صلاحيات إضافية"}</span></p>
                            <p>الأدوار المركزية النشطة: <span className={activeCentralAssignments.length === 0 ? "text-emerald-300" : "text-red-300"}>{activeCentralAssignments.length === 0 ? "لا يوجد" : activeCentralAssignments.length}</span></p>
                            <p>حذف سجلات الإنتاج: <span className={hasDelete ? "text-red-300" : "text-emerald-300"}>{hasDelete ? "موجود ضمن صلاحيات نشطة" : "غير موجود ضمن الصلاحيات النشطة"}</span></p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </section>

        <p className="text-xs text-slate-500">
          إدارة الدعوات متاحة للمستخدمين الذين يمتلكون صلاحية
          system.users.manage. لا يتم تفعيل حساب المدعو قبل قبول الدعوة
          والتحقق من حدث Clerk.
        </p>
      </div>
    </main>
  );
}
