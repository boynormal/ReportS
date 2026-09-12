import type { Metadata } from "next";
import { Suspense } from "react";
import { PageViewLogger } from "@/components/PageViewLogger";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboard Scrapee",
  description: "อ่านจากคลัง Postgres ของ Scrapee",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <Suspense fallback={null}>
          <PageViewLogger />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
