import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoanStatusBadge } from "@/components/loans/LoanStatusBadge";
import { requirePageUser } from "@/lib/auth/guards";
import { isStaff } from "@/lib/auth/permissions";
import { formatDateOnly } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { getLoan } from "@/lib/services/loanService";

export const metadata: Metadata = { title: "Loan | BorrowHub" };

async function LoanContent({ params }: Pick<PageProps<"/loans/[id]">, "params">) {
  const user = await requirePageUser(); // FR-01
  const { id } = await params;
  // FR-04, AC-06: another borrower's loan renders exactly like one that does not exist.
  const loan = await getLoan(id, user).catch((error) => {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  });
  const staff = isStaff(user.role);

  return (
    <>
      <p>
        <Link href={staff ? "/staff/loans" : "/loans"} className="underline">
          Back to loans
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{loan.item.name}</h1>
        <LoanStatusBadge status={loan.status} overdue={loan.overdue} />
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        <dt className="font-medium">Item ID</dt>
        <dd>{loan.item.itemCode}</dd>
        {staff && (
          <>
            <dt className="font-medium">Borrower</dt>
            <dd className="break-words">
              {loan.borrower.name} ({loan.borrower.email})
            </dd>
          </>
        )}
        <dt className="font-medium">Checked out</dt>
        <dd>{formatDateOnly(loan.checkoutDate)}</dd>
        <dt className="font-medium">Due back</dt>
        <dd>{formatDateOnly(loan.agreedDueDate)}</dd>
        <dt className="font-medium">Condition at checkout</dt>
        <dd className="break-words whitespace-pre-wrap">{loan.checkoutCondition}</dd>
        {/* NFR-06 */}
        {loan.checkedOutBy && (
          <>
            <dt className="font-medium">Checked out by</dt>
            <dd>{loan.checkedOutBy.name}</dd>
          </>
        )}
      </dl>
    </>
  );
}

export default function LoanPage({ params }: PageProps<"/loans/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-12">
      <Suspense fallback={<p>Loading the loan…</p>}>
        <LoanContent params={params} />
      </Suspense>
    </main>
  );
}
