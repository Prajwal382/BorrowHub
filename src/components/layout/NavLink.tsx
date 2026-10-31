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
      className="underline aria-[current=page]:font-semibold aria-[current=page]:no-underline"
    >
      {children}
    </Link>
  );
}
