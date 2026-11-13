"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function CurrentUserName({ showLabel = false }: { showLabel?: boolean }) {
  const profile = useQuery(api.users.getMyProfile);
  const name = profile === undefined
    ? "جارٍ تحميل الاسم..."
    : profile?.fullName?.trim() || "الاسم غير مسجل";

  if (showLabel) {
    return (
      <span className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-200 text-[9px] font-bold">
          {name === "جارٍ تحميل الاسم..." || name === "الاسم غير مسجل" ? "؟" : name.charAt(0)}
        </span>
        <span>الحساب الحالي: {name}</span>
      </span>
    );
  }

  return <span>{name}</span>;
}
