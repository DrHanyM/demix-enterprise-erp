"use client";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import BackToDashboard from "@/components/BackToDashboard";
export default function OperationsSetupPage() {
  const register = useMutation(api.operations.registerOperationsPermissions);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  async function run(){setBusy(true);setError("");setMessage("");try{const result=await register({});setMessage("تم تسجيل "+result.created.length+" صلاحية جديدة. الموجودة مسبقًا: "+result.existing.length+". لم يتم تغيير صلاحيات أي مستخدم أو دور.");}catch(e){setError(e instanceof Error?e.message:"تعذر تسجيل الصلاحيات.");}finally{setBusy(false);}}
  return <main dir="rtl" className="min-h-screen bg-slate-50 p-5 text-slate-800"><div className="mx-auto max-w-3xl space-y-5"><div className="flex items-center justify-between"><h1 className="text-2xl font-extrabold">تهيئة صلاحيات وحدات التشغيل</h1><BackToDashboard /></div><section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"><p className="text-sm leading-7 text-slate-600">تُسجّل هذه الخطوة تعريفات الصلاحيات فقط: المعدات، المخزون، الخامات، وتقارير التشغيل. لا تمنح الصلاحيات تلقائيًا للمسؤول الأعلى أو لأي مستخدم، ولا تغيّر أدوار أو صلاحيات قائمة.</p><button disabled={busy} onClick={()=>void run()} className="rounded-lg bg-[#172b4d] px-5 py-3 font-bold text-white disabled:opacity-50">{busy?"جارٍ التسجيل...":"تسجيل تعريفات الصلاحيات"}</button>{message&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message} بعد ذلك تُراجع وتُمنح الصلاحيات المطلوبة من شاشة إدارة الأدوار.</p>}{error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}</section></div></main>;
}