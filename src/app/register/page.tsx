import type { Metadata } from "next";
import { Suspense } from "react";
import { RedirectIfSignedIn } from "@/components/auth/RedirectIfSignedIn";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = { title: "Create account | BorrowHub" };

export default function RegisterPage() {
  return (
    <Page width="narrow">
      <h1 className="page-title">Create account</h1>
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <RegisterForm />
    </Page>
  );
}
import { Page } from "@/components/layout/Page";
