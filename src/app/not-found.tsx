import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/layout/Page";

export const metadata: Metadata = { title: "Page not found | BorrowHub" };

// AC-06: also shown for pages a user may not open, so it must not say which case applies.
export default function NotFound() {
  return (
    <Page width="medium">
      <h1 className="page-title">Page not found</h1>
      <p>This page does not exist, or your account cannot open it. Check the link and try again.</p>
      <p>
        <Link href="/" className="underline">
          Go to the home page
        </Link>
      </p>
    </Page>
  );
}
