import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ItemStatusBadge } from "@/components/items/ItemStatusBadge";
import { Page } from "@/components/layout/Page";
import { Pagination } from "@/components/Pagination";
import { RequestActions } from "@/components/requests/RequestActions";
import { RequestStatusBadge } from "@/components/requests/RequestStatusBadge";
import { ItemStatus, RequestStatus } from "@/generated/prisma/enums";
import { requirePageRole } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { formatDateOnly, formatDateTime, orgToday, toDateOnlyString } from "@/lib/dates";
import { REQUEST_STATUS_LABELS } from "@/lib/requestStatus";
import { listRequests } from "@/lib/services/requestService";

export const metadata: Metadata = { title: "Requests | BorrowHub" };

const ALL = "All";
const FILTERS = [...Object.values(RequestStatus), ALL] as const;
type Filter = (typeof FILTERS)[number];

function parseFilter(value: unknown): Filter {
  return FILTERS.includes(value as Filter) ? (value as Filter) : RequestStatus.Pending;
}

function filterHref(filter: Filter, page = 1) {
  const params = new URLSearchParams({ status: filter });
  if (page > 1) params.set("page", String(page));
  return `/staff/requests?${params}`;
}

async function StaffRequests({ searchParams }: Pick<PageProps<"/staff/requests">, "searchParams">) {
  const staff = await requirePageRole(...STAFF_ROLES); // FR-02, FR-11, AC-06
  const today = orgToday();
  const params = await searchParams;
  const filter = parseFilter(params.status);
  const requestedPage = Number(params.page);
  const { requests, total, page, pageCount } = await listRequests(staff, {
    status: filter === ALL ? undefined : filter,
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  });

  return (
    <>
      <h1 className="page-title">Requests</h1>

      <nav aria-label="Filter requests by status" className="flex flex-wrap gap-x-4 gap-y-1">
        {FILTERS.map((option) => (
          <Link
            key={option}
            href={filterHref(option)}
            aria-current={option === filter ? "page" : undefined}
            className="underline aria-[current=page]:font-semibold aria-[current=page]:no-underline"
          >
            {option === ALL ? ALL : REQUEST_STATUS_LABELS[option]}
          </Link>
        ))}
      </nav>

      <p role="status">
        {total} {total === 1 ? "request" : "requests"}
      </p>

      {requests.length === 0 ? (
        <p>No requests to show here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-col gap-2 card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="font-semibold">
                  <Link href={`/catalog/${request.item.id}`} className="underline">
                    {request.item.name}
                  </Link>{" "}
                  <span className="font-normal opacity-80">({request.item.itemCode})</span>
                </h2>
                <RequestStatusBadge status={request.status} />
              </div>
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                <dt className="font-medium">Borrower</dt>
                <dd>
                  {request.borrower.name} ({request.borrower.email})
                </dd>
                <dt className="font-medium">Intended use</dt>
                <dd>{request.intendedUse}</dd>
                <dt className="font-medium">Requested return</dt>
                <dd>{formatDateOnly(request.requestedReturnDate)}</dd>
                <dt className="font-medium">Submitted</dt>
                <dd>{formatDateTime(request.submittedAt)}</dd>
                <dt className="font-medium">Item status</dt>
                <dd>
                  <ItemStatusBadge status={request.item.status} />
                </dd>
                {request.rejectionReason && (
                  <>
                    <dt className="font-medium">Reason for rejection</dt>
                    <dd>{request.rejectionReason}</dd>
                  </>
                )}
                {/* NFR-06 */}
                {request.decidedBy && request.decidedAt && (
                  <>
                    <dt className="font-medium">Decided by</dt>
                    <dd>
                      {request.decidedBy.name} on {formatDateTime(request.decidedAt)}
                    </dd>
                  </>
                )}
                {request.cancelledBy && request.cancelledAt && (
                  <>
                    <dt className="font-medium">Hold cancelled by</dt>
                    <dd>
                      {request.cancelledBy.name} on {formatDateTime(request.cancelledAt)}
                    </dd>
                  </>
                )}
              </dl>
              <RequestActions
                requestId={request.id}
                itemName={request.item.name}
                borrowerName={request.borrower.name}
                status={request.status}
                itemAvailable={request.item.status === ItemStatus.Available}
                today={toDateOnlyString(today)}
                // A hold can outlast the date first asked for; the due date must not precede today.
                defaultDueDate={toDateOnlyString(
                  request.requestedReturnDate > today ? request.requestedReturnDate : today,
                )}
              />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        label="Request pages"
        page={page}
        pageCount={pageCount}
        hrefFor={(target) => filterHref(filter, target)}
      />
    </>
  );
}

export default function StaffRequestsPage({ searchParams }: PageProps<"/staff/requests">) {
  return (
    <Page>
      <Suspense fallback={<p>Loading requests…</p>}>
        <StaffRequests searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}
