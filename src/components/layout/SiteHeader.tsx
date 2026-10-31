import Link from "next/link";
import { Suspense } from "react";
import { UserNav } from "@/components/layout/UserNav";

export function SiteHeader() {
  return (
    <header className="border-b border-foreground/20">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          BorrowHub
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Suspense fallback={<span className="opacity-70">Loading…</span>}>
            <UserNav />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
