import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePageUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Dashboard | BorrowHub" };

async function DashboardContent() {
  const user = await requirePageUser(); // FR-01

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
      <p>
        You are signed in as {user.email} with the {user.role} role.
      </p>
    </>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-4 py-12">
      <Suspense fallback={<p>Loading your dashboard…</p>}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
