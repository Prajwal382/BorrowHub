import type { Metadata } from "next";
import { Suspense } from "react";
import { NoticeToast } from "@/components/feedback/NoticeToast";
import { SiteHeader } from "@/components/layout/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "BorrowHub",
  description: "Equipment lending and return management",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* NFR-04: lets keyboard users jump past the navigation. */}
        <a
          href="#content"
          className="sr-only rounded-md bg-foreground px-4 py-2 text-background focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20"
        >
          Skip to main content
        </a>
        <SiteHeader />
        {/* The target is here, not on a page, as Next.js keeps visited pages alive but hidden. */}
        <div id="content" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
          {children}
        </div>
        <Suspense fallback={null}>
          <NoticeToast />
        </Suspense>
      </body>
    </html>
  );
}
