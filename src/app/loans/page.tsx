import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoanStatusBadge } from "@/components/loans/LoanStatusBadge";
import { Pagination } from "@/components/Pagination";
import { LoanStatus, Role } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/auth/guards";
import { formatDateOnly } from "@/lib/dates";
import { listLoans } from "@/lib/services/loanService";
import { loanQuerySchema } from "@/lib/validation/loans";

export const metadata: Metadata = { title: "My loans | BorrowHub" };

async function MyLoans({ searchParams }: Pick<PageProps<"/loans">, "searchParams">) {
  const user = await requirePageUser(); // FR-01
  const query = loanQuerySchema.parse(await searchParams);
  // FR-04, FR-18: always this user's own active loans, including for staff who open this page.
  const { loans, page, pageCount } = await listLoans(
    { id: user.id, role: Role.Borrower },
    { ...query, status: LoanStatus.Active, overdue: undefined },
  );

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">My loans</h1>
      {loans.length === 0 ? (
        <p>You have no items checked out right now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {loans.map((loan) => (
            <li key={loan.id} className="rounded-md border border-foreground/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="font-semibold">
                  <Link href={`/loans/${loan.id}`} className="underline">
                    {loan.item.name}
                  </Link>
                </h2>
                <LoanStatusBadge status={loan.status} overdue={loan.overdue} />
              </div>
              <p className="text-sm opacity-80">{loan.item.itemCode}</p>
              <p className="mt-2">
                <span className="font-medium">Due back:</span> {formatDateOnly(loan.agreedDueDate)}
              </p>
              {loan.overdue && <p>This item is overdue. Please return it to staff.</p>}
            </li>
          ))}
        </ul>
      )}
      <Pagination
        label="Loan pages"
        page={page}
        pageCount={pageCount}
        hrefFor={(target) => `/loans?page=${target}`}
      />
    </>
  );
}

export default function LoansPage({ searchParams }: PageProps<"/loans">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-12">
      <Suspense fallback={<p>Loading your loans…</p>}>
        <MyLoans searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
