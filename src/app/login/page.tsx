import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { RedirectIfSignedIn } from "@/components/auth/RedirectIfSignedIn";

export const metadata: Metadata = { title: "Log in | BorrowHub" };

export default function LoginPage() {
  return (
    <Page width="narrow">
      <div className="card flex flex-col gap-5 p-6 sm:p-8">
        <div>
          <h1 className="page-title">Log in</h1>
          <p className="mt-1 text-muted">Welcome back. Log in to browse and request equipment.</p>
        </div>
        <Suspense>
          <RedirectIfSignedIn />
          <LoginForm />
        </Suspense>
      </div>
    </Page>
  );
}
import { Page } from "@/components/layout/Page";
