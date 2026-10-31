import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoanStatusBadge } from "@/components/loans/LoanStatusBadge";
import { Pagination } from "@/components/Pagination";
import { LoanStatus } from "@/generated/prisma/enums";
import { requirePageRole } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { formatDateOnly } from "@/lib/dates";
import { listLoans } from "@/lib/services/loanService";
import { loanQuerySchema } from "@/lib/validation/loans";

export const metadata: Metadata = { title: "Loans | BorrowHub" };

function loansHref(overdue: boolean | undefined, page = 1) {
  const params = new URLSearchParams();
  if (overdue) params.set("overdue", "true");
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/staff/loans?${search}` : "/staff/loans";
}

async function StaffLoans({ searchParams }: Pick<PageProps<"/staff/loans">, "searchParams">) {
  const staff = await requirePageRole(...STAFF_ROLES); // FR-02, FR-18, AC-06
  const query = loanQuerySchema.parse(await searchParams);
  const { loans, total, page, pageCount } = await listLoans(staff, {
    ...query,
    status: LoanStatus.Active,
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Active loans</h1>

      {/* FR-19, AC-04 */}
      <nav aria-label="Filter loans" className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href={loansHref(undefined)}
          aria-current={query.overdue ? undefined : "page"}
          className="underline aria-[current=page]:font-semibold aria-[current=page]:no-underline"
        >
          All active
        </Link>
        <Link
          href={loansHref(true)}
          aria-current={query.overdue ? "page" : undefined}
          className="underline aria-[current=page]:font-semibold aria-[current=page]:no-underline"
        >
          Overdue
        </Link>
      </nav>

      <p role="status">
        {total} {query.overdue ? "overdue" : "active"} {total === 1 ? "loan" : "loans"}
      </p>

      {loans.length === 0 ? (
        <p>No loans to show here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {loans.map((loan) => (
            <li key={loan.id} className="rounded-md border border-foreground/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="font-semibold">
                  <Link href={`/loans/${loan.id}`} className="underline">
                    {loan.item.name}
                  </Link>{" "}
                  <span className="font-normal opacity-80">({loan.item.itemCode})</span>
                </h2>
                <LoanStatusBadge status={loan.status} overdue={loan.overdue} />
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                <dt className="font-medium">Borrower</dt>
                <dd className="break-words">
                  {loan.borrower.name} ({loan.borrower.email})
                </dd>
                <dt className="font-medium">Checked out</dt>
                <dd>{formatDateOnly(loan.checkoutDate)}</dd>
                <dt className="font-medium">Due back</dt>
                <dd>{formatDateOnly(loan.agreedDueDate)}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        label="Loan pages"
        page={page}
        pageCount={pageCount}
        hrefFor={(target) => loansHref(query.overdue, target)}
      />
    </>
  );
}

export default function StaffLoansPage({ searchParams }: PageProps<"/staff/loans">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-12">
      <Suspense fallback={<p>Loading loans…</p>}>
        <StaffLoans searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
