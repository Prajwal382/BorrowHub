"use client";

import Link from "next/link";
import { Page } from "@/components/layout/Page";

// NFR-02: the details stay in the server log. People get what happened and what to do next.
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <Page width="medium">
      <h1 className="page-title">We could not load this page</h1>
      <p role="alert">Something went wrong on our side. Try again in a moment.</p>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => retry()} className="button-primary">
          Try again
        </button>
        <Link href="/" className="underline">
          Go to the home page
        </Link>
      </div>
    </Page>
  );
}
