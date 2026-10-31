import type { Metadata } from "next";
import { Suspense } from "react";
import { LoanHistory } from "@/components/loans/LoanHistory";
import { LoanStatus, Role } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/auth/guards";
import { listLoans } from "@/lib/services/loanService";
import { loanQuerySchema } from "@/lib/validation/loans";

export const metadata: Metadata = { title: "My history | BorrowHub" };

async function MyHistory({ searchParams }: Pick<PageProps<"/history">, "searchParams">) {
  const user = await requirePageUser(); // FR-01
  const query = loanQuerySchema.parse(await searchParams);
  // FR-23: always this user's own completed loans, including for staff who open this page.
  const result = await listLoans(
    { id: user.id, role: Role.Borrower },
    { ...query, status: LoanStatus.Closed, overdue: undefined },
  );

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">My history</h1>
      <LoanHistory
        path="/history"
        searchLabel="Search by item"
        showBorrower={false}
        q={query.q}
        {...result}
      />
    </>
  );
}

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-12">
      <Suspense fallback={<p>Loading your history…</p>}>
        <MyHistory searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
