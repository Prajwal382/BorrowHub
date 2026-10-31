"use client";

import { Page } from "@/components/layout/Page";
import "./globals.css";

// NFR-02: shown when the header itself cannot load, which replaces the whole document.
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>Something went wrong | BorrowHub</title>
        <Page width="medium">
          <h1 className="page-title">BorrowHub is having trouble</h1>
          <p role="alert">We could not load this page. Try again in a moment.</p>
          <p>
            <button type="button" onClick={() => retry()} className="button-primary">
              Try again
            </button>
          </p>
        </Page>
      </body>
    </html>
  );
}
