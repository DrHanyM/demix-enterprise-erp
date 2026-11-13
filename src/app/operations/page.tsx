import Link from "next/link";
import BackToDashboard from "@/components/BackToDashboard";
export default function OperationsPage() {
  const cards = [
    { href: "/operations/production", title: "سجل الإنتاج المستورد", description: "متابعة الإنتاج الفعلي الوارد من المحطات مع فلاتر التاريخ والمحطة، دون تعديل المصدر." },
    { href: "/operations/equipment", title: "المعدات والصيانة", description: "سجل الأصول والمعدات وأوامر الصيانة والأعطال والتوقف." },
    { href: "/operations/inventory", title: "المخازن والمخزون", description: "تعريف المخازن والأصناف وأرصدة المخزون وحركات الاستلام والصرف والتحويل." },
    { href: "/operations/reports", title: "تقارير التشغيل الموحدة", description: "مؤشرات الإنتاج الفعلي والمعدات والصيانة والمخزون." },
    { href: "/operations/setup", title: "تهيئة صلاحيات الوحدات", description: "تسجيل تعريفات الصلاحيات الجديدة دون منحها تلقائيًا لأي مستخدم." },
  ];
  return <main dir="rtl" className="min-h-screen bg-slate-50 p-5 text-slate-800 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-teal-700">DEMIX ENTERPRISE ERP</p><h1 className="mt-1 text-2xl font-extrabold">إدارة العمليات المتكاملة</h1><p className="mt-2 text-sm text-slate-600">ربط الإنتاج الفعلي بالمعدات والمخازن والرقابة التشغيلية.</p></div><BackToDashboard /></div>
    <div className="grid gap-4 md:grid-cols-2">{cards.map(card=><Link key={card.href} href={card.href} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-500 hover:bg-teal-50"><h2 className="font-bold">{card.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p><span className="mt-4 inline-block text-sm font-bold text-teal-700">فتح الوحدة ←</span></Link>)}</div>
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><b>ضوابط الربط:</b> بيانات Access الأصلية للقراءة فقط. سجلات الإنتاج المستوردة منفصلة عن الإدخال اليدوي. لا يتم خصم مخزون تلقائيًا عند وصول سجل إنتاج. ربط رموز الخامات لا يُفعّل إلا بعد اعتماد اسم كل حقل ووحدته.</section>
  </div></main>;
}