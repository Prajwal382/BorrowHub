import Link from "next/link";
import { Suspense } from "react";
import { UserNav } from "@/components/layout/UserNav";

export function SiteHeader() {
  return (
    <header className="bg-maroon text-cream">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gold text-maroon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 7l9-4 9 4-9 4z" />
              <path d="M3 7v10l9 4 9-4V7" />
              <path d="M12 11v10" />
            </svg>
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight">BorrowHub</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
          <Suspense fallback={<span className="px-3 text-muted">Loading…</span>}>
            <UserNav />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
