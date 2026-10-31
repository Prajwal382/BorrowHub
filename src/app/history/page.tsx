import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/layout/Page";
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
      <h1 className="page-title">My history</h1>
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
    <Page width="medium">
      <Suspense fallback={<p>Loading your history…</p>}>
        <MyHistory searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}
