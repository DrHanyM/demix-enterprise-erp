import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DEMIX ENTERPRISE ERP",
    template: "%s | DEMIX ERP",
  },
  description:
    "نظام ديتاك المتكامل لإدارة الموارد البشرية والحضور والانصراف والرواتب",
  applicationName: "DEMIX ENTERPRISE ERP",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="min-h-full">
        <ClerkProvider>
          <ConvexClientProvider>
            {children}
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
