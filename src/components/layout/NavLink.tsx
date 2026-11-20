"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// NFR-04: marks the current section for sighted and screen reader users alike.
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="flex min-h-11 items-center rounded-lg px-3 text-[15px] font-medium text-cream hover:bg-cream/10 aria-[current=page]:bg-cream/15 aria-[current=page]:font-semibold"
    >
      {children}
    </Link>
  );
}
