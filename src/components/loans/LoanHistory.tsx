import Link from "next/link";
import { Pagination } from "@/components/Pagination";
import { formatDateOnly } from "@/lib/dates";
import type { LoanView } from "@/lib/services/loanService";
import { MAX_SEARCH_LENGTH } from "@/lib/validation/items";

type LoanHistoryProps = {
  path: string;
  searchLabel: string;
  showBorrower: boolean;
  q?: string;
  loans: LoanView[];
  total: number;
  page: number;
  pageCount: number;
};

// FR-22, FR-23: shared by the borrower and staff history pages, which load different loans.
export function LoanHistory({
  path,
  searchLabel,
  showBorrower,
  q,
  loans,
  total,
  page,
  pageCount,
}: LoanHistoryProps) {
  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (target > 1) params.set("page", String(target));
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  };

  return (
    <>
      {/* The key refreshes the input when a link changes the search without a full page load. */}
      <form
        key={q ?? ""}
        action={path}
        method="get"
        role="search"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="history-q" className="font-medium">
            {searchLabel}
          </label>
          <input
            id="history-q"
            name="q"
            type="search"
            maxLength={MAX_SEARCH_LENGTH}
            defaultValue={q}
            className="rounded-md border border-foreground/40 bg-background px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background"
        >
          Search
        </button>
      </form>

      <p role="status">
        {total} completed {total === 1 ? "loan" : "loans"}
      </p>

      {loans.length === 0 ? (
        <p>No completed loans to show here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {loans.map((loan) => (
            <li key={loan.id} className="rounded-md border border-foreground/20 p-4">
              <h2 className="font-semibold">
                <Link href={`/loans/${loan.id}`} className="underline">
                  {loan.item.name}
                </Link>{" "}
                <span className="font-normal opacity-80">({loan.item.itemCode})</span>
              </h2>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                {showBorrower && (
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
                <dt className="font-medium">Returned</dt>
                <dd>{loan.returnDate && formatDateOnly(loan.returnDate)}</dd>
                <dt className="font-medium">Condition at checkout</dt>
                <dd className="break-words">{loan.checkoutCondition}</dd>
                <dt className="font-medium">Condition on return</dt>
                <dd className="break-words">{loan.returnCondition}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}

      <Pagination label="History pages" page={page} pageCount={pageCount} hrefFor={hrefFor} />
    </>
  );
}
