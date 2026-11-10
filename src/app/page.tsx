import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

const menuGroups: {
  title: string;
  items: { icon: string; label: string; active?: boolean; href?: string }[];
}[] = [
  {
    title: "الرئيسية",
    items: [{ icon: "▦", label: "لوحة التحكم", active: true, href: "/" }],
  },
  {
    title: "إدارة الموارد البشرية",
    items: [
      { icon: "♙", label: "ملفات الموظفين", href: "/hr/employees" },
      { icon: "▦", label: "الشركات والهيكل التنظيمي", href: "/hr/structure" },
      { icon: "◷", label: "الحضور والانصراف" },
      { icon: "▤", label: "الورديات والجداول" },
      { icon: "▧", label: "الإجازات والمأموريات" },
      { icon: "⚑", label: "الجزاءات والمكافآت" },
    ],
  },
  {
    title: "الإدارة المالية",
    items: [
      { icon: "＄", label: "السلف والقروض" },
      { icon: "▣", label: "إدارة الرواتب" },
      { icon: "▥", label: "التقارير المالية" },
    ],
  },
  {
    title: "إدارة النظام",
    items: [
      { icon: "⌂", label: "الشركات والمحطات", href: "/stations" },
      { icon: "⚙", label: "المستخدمون والصلاحيات", href: "/users" },
      { icon: "◈", label: "سجل المراجعة", href: "/audit-logs" },
      { icon: "⚙", label: "إعدادات النظام" },
    ],
  },
];

const stats = [
  {
    label: "إجمالي الموظفين",
    value: "1,248",
    note: "إجمالي الموظفين المسجلين",
    icon: "♙",
    tone: "blue",
  },
  {
    label: "الحضور اليوم",
    value: "1,106",
    note: "88.6% من إجمالي الموظفين",
    icon: "✓",
    tone: "green",
  },
  {
    label: "الغياب اليوم",
    value: "86",
    note: "6.9% من إجمالي الموظفين",
    icon: "×",
    tone: "red",
  },
  {
    label: "طلبات الإجازات",
    value: "24",
    note: "تحتاج إلى المراجعة",
    icon: "▧",
    tone: "orange",
  },
];

const attendance = [
  { day: "السبت", value: 82 },
  { day: "الأحد", value: 91 },
  { day: "الإثنين", value: 86 },
  { day: "الثلاثاء", value: 94 },
  { day: "الأربعاء", value: 89 },
  { day: "الخميس", value: 96 },
  { day: "الجمعة", value: 68 },
];

const activities = [
  {
    title: "طلب إجازة جديد",
    detail: "طلب إجازة سنوية – محطة القاهرة",
    time: "منذ 15 دقيقة",
    status: "بانتظار المراجعة",
    tone: "orange",
  },
  {
    title: "تسجيل موظف جديد",
    detail: "تمت إضافة ملف موظف جديد",
    time: "منذ 42 دقيقة",
    status: "تم التسجيل",
    tone: "green",
  },
  {
    title: "طلب تصحيح حضور",
    detail: "طلب مراجعة سجل الحضور",
    time: "منذ ساعة",
    status: "بانتظار المراجعة",
    tone: "orange",
  },
  {
    title: "تحديث بيانات موظف",
    detail: "تم تحديث بيانات وظيفية",
    time: "منذ ساعتين",
    status: "مكتمل",
    tone: "blue",
  },
];

const stations = [
  { name: "محطة القاهرة", employees: 386, attendance: 92 },
  { name: "محطة الإسكندرية", employees: 294, attendance: 89 },
  { name: "محطة العاشر من رمضان", employees: 218, attendance: 87 },
  { name: "محطة بني سويف", employees: 172, attendance: 91 },
  { name: "محطة أخرى", employees: 178, attendance: 84 },
];

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h2 className="text-base font-bold text-slate-800">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      )}
    </div>
  );
}

export default async function Home() {
  await auth.protect();

  return (
    <main
      id="dashboard"
      className="min-h-screen bg-[#f4f6fa] text-slate-800"
      dir="rtl"
    >
      <div className="flex min-h-screen">
        <aside className="hidden w-[258px] shrink-0 flex-col bg-[#172b4d] text-white lg:flex">
          <div className="flex h-[82px] items-center gap-3 border-b border-white/10 px-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-400 text-xl font-black text-[#172b4d]">
              D
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-wide">
                DEMIX ERP
              </div>
              <div className="mt-1 text-[10px] text-slate-300">
                Enterprise Management System
              </div>
            </div>
          </div>

          <div className="px-5 py-5">
            <div className="rounded-xl border border-white/10 bg-white/[0.07] p-3">
              <div className="text-[10px] text-slate-300">
                الشركة الحالية
              </div>
              <div className="mt-2 text-sm font-bold">
                ديتاك للخرسانة الجاهزة
              </div>
              <div className="mt-1 text-[10px] text-teal-300">
                الإدارة المركزية
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-6 overflow-y-auto px-4 pb-6">
            {menuGroups.map((group) => (
              <div key={group.title}>
                <div className="mb-2 px-3 text-[10px] font-bold text-slate-400">
                  {group.title}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const itemClass = `flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs transition-colors ${
                      item.active
                        ? "bg-teal-400 font-bold text-[#172b4d]"
                        : "text-slate-200 hover:bg-white/10"
                    }`;

                    const itemContent = (
                      <>
                        <span className="w-5 text-center text-base">
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                        {item.active && (
                          <span className="mr-auto h-1.5 w-1.5 rounded-full bg-[#172b4d]" />
                        )}
                      </>
                    );

                    return item.href ? (
                      <Link
                        key={item.label}
                        href={item.href}
                        aria-current={item.active ? "page" : undefined}
                        className={itemClass}
                      >
                        {itemContent}
                      </Link>
                    ) : (
                      <div key={item.label} className={itemClass}>
                        {itemContent}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-white/10 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
                م
              </div>
              <div>
                <div className="text-xs font-bold">مدير النظام</div>
                <div className="mt-1 text-[10px] text-slate-400">
                  الإدارة المركزية
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex min-h-[76px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-7">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#172b4d] font-black text-teal-300 lg:hidden">
                D
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-slate-800">
                  لوحة التحكم الرئيسية
                </h1>
                <p className="mt-1 text-[11px] text-slate-500">
                  نظرة عامة على أداء وإدارة الموارد البشرية
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 sm:flex">
                <span className="text-teal-600">▣</span>
                جميع المحطات
                <span className="text-slate-400">⌄</span>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                وضع العرض التجريبي
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600">
                ♧
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-7">

            {/* اختبار اتصال Clerk مع Convex */}
            {/* تهيئة المدير المركزي */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-800">
                  مرحباً بك في DEMIX ERP
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  مركز الإدارة الموحد للموارد البشرية والتشغيل
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                الفترة: عرض تجريبي
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      {stat.label}
                    </span>
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold ${
                        stat.tone === "blue"
                          ? "bg-blue-50 text-blue-700"
                          : stat.tone === "green"
                            ? "bg-emerald-50 text-emerald-700"
                            : stat.tone === "red"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-orange-50 text-orange-700"
                      }`}
                    >
                      {stat.icon}
                    </span>
                  </div>
                  <div className="mt-4 text-3xl font-extrabold tracking-tight text-slate-800">
                    {stat.value}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    {stat.note}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SectionTitle
                    title="معدل الحضور الأسبوعي"
                    subtitle="نسبة الحضور اليومية – بيانات تجريبية"
                  />
                  <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                    متوسط الحضور 87.9%
                  </span>
                </div>

                <div className="mt-7 flex h-52 items-end justify-around gap-3 border-b border-slate-100 pb-2">
                  {attendance.map((item) => (
                    <div
                      key={item.day}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                    >
                      <span className="text-[10px] font-bold text-slate-500">
                        {item.value}%
                      </span>
                      <div className="flex h-[145px] w-full items-end justify-center">
                        <div
                          className="w-full max-w-12 rounded-t-md bg-[#31558b] transition-all"
                          style={{ height: `${item.value}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {item.day}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#31558b]" />
                  نسبة الحضور
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionTitle
                  title="ملخص القوى العاملة"
                  subtitle="توزيع الموظفين حسب الحالة"
                />

                <div className="mt-7 flex items-center justify-center">
                  <div className="relative flex h-40 w-40 items-center justify-center rounded-full border-[15px] border-emerald-500">
                    <div className="absolute inset-[-15px] rounded-full border-[15px] border-transparent border-t-blue-500 border-l-blue-500 -rotate-45" />
                    <div className="text-center">
                      <div className="text-3xl font-extrabold">1,248</div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        إجمالي الموظفين
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      على رأس العمل
                    </span>
                    <strong>1,106</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                      حالات أخرى
                    </span>
                    <strong>142</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionTitle
                  title="أداء المحطات"
                  subtitle="توزيع الموظفين ونسبة الحضور – بيانات تجريبية"
                />

                <div className="mt-5 space-y-5">
                  {stations.map((station) => (
                    <div key={station.name}>
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-700">
                          {station.name}
                        </span>
                        <span className="text-slate-500">
                          {station.employees} موظف · {station.attendance}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-teal-500"
                          style={{ width: `${station.attendance}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionTitle
                  title="آخر العمليات والتنبيهات"
                  subtitle="سجل توضيحي للأنشطة الأخيرة"
                />

                <div className="mt-4 divide-y divide-slate-100">
                  {activities.map((activity) => (
                    <div
                      key={activity.title}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-700">
                          {activity.title}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          {activity.detail}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          {activity.time}
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold ${
                          activity.tone === "orange"
                            ? "bg-orange-50 text-orange-700"
                            : activity.tone === "green"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {activity.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-5 text-[10px] text-slate-400">
              <span>
                DEMIX ENTERPRISE ERP · نظام إدارة ديتاك المتكامل
              </span>
              <span>الإصدار التأسيسي V1.0 · واجهة تجريبية</span>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
