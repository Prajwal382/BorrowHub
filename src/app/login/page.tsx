import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { RedirectIfSignedIn } from "@/components/auth/RedirectIfSignedIn";

export const metadata: Metadata = { title: "Log in | BorrowHub" };

export default function LoginPage() {
  return (
    <Page width="narrow">
      <h1 className="page-title">Log in</h1>
      <Suspense>
        <RedirectIfSignedIn />
        <LoginForm />
      </Suspense>
    </Page>
  );
}
import { Page } from "@/components/layout/Page";
