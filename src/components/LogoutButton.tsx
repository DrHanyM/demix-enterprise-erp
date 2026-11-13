"use client";

import { useClerk } from "@clerk/nextjs";
import { useState } from "react";

export default function LogoutButton({ className = "" }: { className?: string }) {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut({ redirectUrl: "/sign-in" });
    } catch (error) {
      console.error("DEMIX sign out failed", error);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className={className || "rounded-lg border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"}
      aria-label="تسجيل الخروج من النظام"
    >
      {busy ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
    </button>
  );
}
