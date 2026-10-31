import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pagination } from "@/components/Pagination";
import { RequestStatusBadge } from "@/components/requests/RequestStatusBadge";
import { requirePageUser } from "@/lib/auth/guards";
import { formatDateOnly, formatDateTime } from "@/lib/dates";
import { listRequests } from "@/lib/services/requestService";
import { requestQuerySchema } from "@/lib/validation/requests";

export const metadata: Metadata = { title: "My requests | BorrowHub" };

async function MyRequests({ searchParams }: Pick<PageProps<"/requests">, "searchParams">) {
  const user = await requirePageUser(); // FR-01
  const query = requestQuerySchema.parse(await searchParams);
  // FR-04, FR-10: always this user's own requests, including for staff who open this page.
  const { requests, page, pageCount } = await listRequests(
    { id: user.id, role: "Borrower" },
    query,
  );

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">My requests</h1>
      {requests.length === 0 ? (
        <p>
          You have no requests yet.{" "}
          <Link href="/catalog" className="underline">
            Browse the catalog
          </Link>{" "}
          to find something to borrow.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <li key={request.id} className="rounded-md border border-foreground/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="font-semibold">
                  <Link href={`/catalog/${request.item.id}`} className="underline">
                    {request.item.name}
                  </Link>
                </h2>
                <RequestStatusBadge status={request.status} />
              </div>
              <p className="text-sm opacity-80">
                {request.item.itemCode} · Submitted {formatDateTime(request.submittedAt)}
              </p>
              <p className="mt-2 break-words">
                <span className="font-medium">Intended use:</span> {request.intendedUse}
              </p>
              <p>
                <span className="font-medium">Requested return:</span>{" "}
                {formatDateOnly(request.requestedReturnDate)}
              </p>
              {/* FR-11 */}
              {request.rejectionReason && (
                <p className="break-words">
                  <span className="font-medium">Reason for rejection:</span>{" "}
                  {request.rejectionReason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pagination
        label="Request pages"
        page={page}
        pageCount={pageCount}
        hrefFor={(target) => `/requests?page=${target}`}
      />
    </>
  );
}

export default function RequestsPage({ searchParams }: PageProps<"/requests">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-12">
      <Suspense fallback={<p>Loading your requests…</p>}>
        <MyRequests searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
