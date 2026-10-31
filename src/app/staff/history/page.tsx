import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/layout/Page";
import { LoanHistory } from "@/components/loans/LoanHistory";
import { LoanStatus } from "@/generated/prisma/enums";
import { requirePageRole } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { listLoans } from "@/lib/services/loanService";
import { loanQuerySchema } from "@/lib/validation/loans";

export const metadata: Metadata = { title: "Loan history | BorrowHub" };

async function StaffHistory({ searchParams }: Pick<PageProps<"/staff/history">, "searchParams">) {
  const staff = await requirePageRole(...STAFF_ROLES); // FR-02, FR-23, AC-06
  const query = loanQuerySchema.parse(await searchParams);
  const result = await listLoans(staff, {
    ...query,
    status: LoanStatus.Closed,
    overdue: undefined,
  });

  return (
    <>
      <h1 className="page-title">Loan history</h1>
      <LoanHistory
        path="/staff/history"
        searchLabel="Search by item, category, or borrower"
        showBorrower
        q={query.q}
        {...result}
      />
    </>
  );
}

export default function StaffHistoryPage({ searchParams }: PageProps<"/staff/history">) {
  return (
    <Page>
      <Suspense fallback={<p>Loading history…</p>}>
        <StaffHistory searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}
