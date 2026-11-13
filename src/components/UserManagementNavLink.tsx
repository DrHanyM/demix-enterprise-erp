"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function UserManagementNavLink() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const canManageUsers = useQuery(
    api.users.canManageUsers,
    isAuthenticated ? {} : "skip"
  );

  if (isLoading || !isAuthenticated || canManageUsers !== true) return null;

  return (
    <a
      href="/users"
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-200 transition-colors hover:bg-white/10"
    >
      <span className="w-5 text-center text-base">⚙</span>
      <span>المستخدمون والصلاحيات</span>
    </a>
  );
}
