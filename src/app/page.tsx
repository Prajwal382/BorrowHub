import Link from "next/link";
import { Suspense } from "react";
import { Page } from "@/components/layout/Page";
import { getCurrentUser } from "@/lib/auth/guards";

async function HomeActions() {
  const user = await getCurrentUser();

  if (user) {
    return (
      <p>
        <Link href="/dashboard" className="button-primary inline-block">
          Go to your dashboard
        </Link>
      </p>
    );
  }
  return (
    <p className="flex flex-wrap gap-3">
      <Link href="/login" className="button-primary">
        Log in
      </Link>
      <Link href="/register" className="button-secondary">
        Create account
      </Link>
    </p>
  );
}

export default function Home() {
  return (
    <Page width="medium">
      <h1 className="text-3xl font-semibold tracking-tight">BorrowHub</h1>
      <p className="text-lg">
        Find equipment, request what you need, and keep track of what is due back.
      </p>
      <Suspense fallback={null}>
        <HomeActions />
      </Suspense>
    </Page>
  );
}
