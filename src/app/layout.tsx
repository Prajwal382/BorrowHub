import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import { Suspense } from "react";
import { NoticeToast } from "@/components/feedback/NoticeToast";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import "./globals.css";

// Self-hosted by next/font, so pages do not wait on a request to Google at view time.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "BorrowHub",
  description: "Equipment lending and return management",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable} ${archivo.variable}`}>
      <body className="flex min-h-full flex-col">
        {/* NFR-04: lets keyboard users jump past the navigation. */}
        <a
          href="#content"
          className="sr-only rounded-lg bg-maroon px-4 py-2 text-cream focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20"
        >
          Skip to main content
        </a>
        <SiteHeader />
        {/* The target is here, not on a page, as Next.js keeps visited pages alive but hidden. */}
        <div id="content" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
          {children}
        </div>
        <SiteFooter />
        <Suspense fallback={null}>
          <NoticeToast />
        </Suspense>
      </body>
    </html>
  );
}
