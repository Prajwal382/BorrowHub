import type { Metadata } from "next";
import { Suspense } from "react";
import { RedirectIfSignedIn } from "@/components/auth/RedirectIfSignedIn";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = { title: "Create account | BorrowHub" };

export default function RegisterPage() {
  return (
    <Page width="narrow">
      <div className="card flex flex-col gap-5 p-6 sm:p-8">
        <div>
          <h1 className="page-title">Create account</h1>
          <p className="mt-1 text-muted">
            Create a borrower account to start requesting equipment.
          </p>
        </div>
        <Suspense>
          <RedirectIfSignedIn />
        </Suspense>
        <RegisterForm />
      </div>
    </Page>
  );
}
import { Page } from "@/components/layout/Page";
