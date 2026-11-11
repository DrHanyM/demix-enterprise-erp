import BackToDashboard from "@/components/BackToDashboard";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

const sections = [
  {
    title: "إدارة المستخدمين والصلاحيات",
    description: "حسابات المستخدمين، الدعوات، والأدوار والصلاحيات.",
    href: "/users",
    action: "فتح إدارة المستخدمين",
  },
  {
    title: "الشركات والمحطات",
    description: "بيانات المحطات وحالات التشغيل والإدارة.",
    href: "/stations",
    action: "فتح إدارة المحطات",
  },
  {
    title: "أدوات المحطات والمزامنة",
    description: "تجهيز ملفات اتصال المحطات ومتابعة الاستقبال المركزي.",
    href: "/stations/tools",
    action: "فتح أدوات المحطات",
  },
  {
    title: "الهيكل التنظيمي",
    description: "الشركات والإدارات والمسميات الوظيفية.",
    href: "/hr/structure",
    action: "فتح الهيكل التنظيمي",
  },
  {
    title: "الحضور والورديات",
    description: "سياسات وسيلة الحضور وتعريف الورديات وتكليف الموظفين.",
    href: "/hr/attendance",
    action: "فتح إعدادات الحضور",
  },
  {
    title: "سجل المراجعة",
    description: "مراجعة العمليات المسجلة في النظام.",
    href: "/audit-logs",
    action: "فتح سجل المراجعة",
  },
];

export default async function SystemSettingsPage() {
  await auth.protect();

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 p-5 text-slate-800 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex justify-end"><BackToDashboard /></div>
        <header className="rounded-2xl bg-[#172b4d] p-6 text-white">
          <p className="text-xs font-semibold text-teal-300">DEMIX ENTERPRISE ERP</p>
          <h1 className="mt-2 text-2xl font-extrabold">إعدادات النظام</h1>
          <p className="mt-2 text-sm text-slate-200">
            مركز الوصول إلى إعدادات الإدارة والموارد البشرية والرقابة.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <article key={section.href} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
              <Link href={section.href} className="mt-4 inline-flex text-sm font-semibold text-blue-700 hover:underline">
                {section.action} ←
              </Link>
            </article>
          ))}
        </section>

        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-900">تنبيه بشأن الإعدادات العامة</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            صفحة مركز الإعدادات أصبحت متاحة وتربطك بوحدات الإعداد الموجودة بالفعل.
            لا توجد حتى الآن شاشة مستقلة لحفظ إعدادات عامة مثل العملة الافتراضية،
            المنطقة الزمنية، وسياسات النظام المركزية؛ لن تُضاف قيم افتراضية أو تغييرات
            على بيانات الشركة دون اعتماد متطلباتك.
          </p>
        </section>
      </div>
    </main>
  );
}
