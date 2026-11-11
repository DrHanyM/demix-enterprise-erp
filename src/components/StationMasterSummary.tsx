"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function StationMasterSummary() {
  const stations = useQuery(api.stations.listActiveStations);

  if (stations === undefined) {
    return <p className="mt-5 text-xs text-slate-500">جارٍ تحميل سجل المحطات المركزي...</p>;
  }

  if (stations.length === 0) {
    return <p className="mt-5 text-xs text-amber-700">لا توجد محطات نشطة مسجلة.</p>;
  }

  return (
    <div className="mt-5 space-y-3">
      {stations.map((station) => (
        <div key={station._id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-700">{station.name}</div>
            <div className="mt-1 text-[10px] text-slate-400">{station.code}</div>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700">نشطة</span>
        </div>
      ))}
      <p className="text-[10px] text-slate-400">
        هذه الأسماء تُقرأ مباشرة من سجل المحطات المشترك مع ملفات الموظفين والحضور والإنتاج.
      </p>
    </div>
  );
}
