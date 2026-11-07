
"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

type InvitationStatus =
  | "inviting"
  | "invited"
  | "accepted"
  | "expired"
  | "revoked"
  | "failed";

export default function UsersPage() {
  const { user: clerkUser } = useUser();
  const data = useQuery(api.users.listUsers);
  const invitations = useQuery(api.invitations.listInvitations);

  const createInvitationDraft = useMutation(
    api.invitations.createInvitationDraft
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );

  const users = data?.users ?? [];
  const invitationList = invitations ?? [];
  const getDisplayEmail = (user: (typeof users)[number]) => {
    const storedEmail = user.email?.trim() ?? "";
    const isTemplateValue = /^\\{\\{.*\\}\\}$/.test(storedEmail);
    if (user.isCurrentUser && isTemplateValue) {
      return clerkUser?.primaryEmailAddress?.emailAddress ?? "جارٍ تحميل البريد الإلكتروني";
    }
    return storedEmail || "—";
  };

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        user.fullName.toLocaleLowerCase().includes(term) ||
        getDisplayEmail(user).toLocaleLowerCase().includes(term);

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

    if (!normalizedName || !normalizedEmail) {
      showMessage("يرجى إدخال الاسم والبريد الإلكتروني.", "error");
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
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-slate-800">
                    <td className="px-4 py-4 font-medium">
                      {user.fullName}
                    </td>

                    <td className="px-4 py-4 text-slate-300">
                      {getDisplayEmail(user)}
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
                  </tr>
                ))}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      لا توجد حسابات مطابقة لعملية البحث.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
