import Link from "next/link";

/** Shared navigation link used by every module page. */
export default function BackToDashboard() {
  return (
    <Link href="/" className="text-sm font-semibold text-blue-700 hover:underline">
      العودة إلى لوحة التحكم
    </Link>
  );
}
