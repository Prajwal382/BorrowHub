import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Page } from "@/components/layout/Page";
import { LoanStatusBadge } from "@/components/loans/LoanStatusBadge";
import { RequestStatusBadge } from "@/components/requests/RequestStatusBadge";
import { LoanStatus, RequestStatus, Role } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/auth/guards";
import { isStaff } from "@/lib/auth/permissions";
import { formatDateOnly } from "@/lib/dates";
import { listLoans, type LoanView } from "@/lib/services/loanService";
import { listRequests, type RequestView } from "@/lib/services/requestService";

export const metadata: Metadata = { title: "Dashboard | BorrowHub" };

const PREVIEW_SIZE = 5;

type Actor = { id: string; role: Role };

type PanelProps = {
  title: string;
  total: number;
  href: string;
  empty: string;
  children: ReactNode;
};

function Panel({ title, total, href, empty, children }: PanelProps) {
  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="text-lg font-bold text-ink">
          {title} <span className="font-semibold text-maroon">({total})</span>
        </h2>
        {total > 0 && (
          <Link
            href={href}
            className="text-sm font-semibold text-maroon underline-offset-4 hover:underline"
          >
            View all<span className="sr-only"> {title.toLowerCase()}</span>
          </Link>
        )}
      </div>
      {total === 0 ? (
        <p className="px-5 py-6 text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">{children}</ul>
      )}
    </section>
  );
}

type StatProps = { label: string; value: number; href: string; alert?: boolean };

// The number is the same total the panel below shows, so the tiles never disagree with the lists.
function Stat({ label, value, href, alert = false }: StatProps) {
  const tone =
    alert && value > 0
      ? "border-[#9b1c1c] bg-[#9b1c1c] text-white hover:bg-[#7f1616]"
      : "border-line bg-white text-ink hover:border-maroon";
  return (
    <Link href={href} className={`flex flex-col gap-1 rounded-2xl border p-5 shadow-sm ${tone}`}>
      <span className="font-display text-4xl font-extrabold">{value}</span>
      <span className={`text-sm font-medium ${alert && value > 0 ? "text-white" : "text-muted"}`}>
        {label}
      </span>
    </Link>
  );
}

const OPEN_REQUEST_STATUSES: RequestStatus[] = [RequestStatus.Pending, RequestStatus.Approved];

function RequestRow({ request, showBorrower }: { request: RequestView; showBorrower: boolean }) {
  // On a finished request this date would read as something still owed.
  const open = OPEN_REQUEST_STATUSES.includes(request.status);

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 px-5 py-3.5">
      <div className="min-w-0">
        <p className="font-semibold">
          <Link
            href={`/catalog/${request.item.id}`}
            className="text-ink hover:text-maroon hover:underline"
          >
            {request.item.name}
          </Link>
        </p>
        {(showBorrower || open) && (
          <p className="text-sm text-muted">
            {showBorrower && request.borrower.name}
            {showBorrower && open && " · "}
            {open && `Requested return date: ${formatDateOnly(request.requestedReturnDate)}`}
          </p>
        )}
      </div>
      <RequestStatusBadge status={request.status} />
    </li>
  );
}

function LoanRow({ loan, showBorrower }: { loan: LoanView; showBorrower: boolean }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 px-5 py-3.5">
      <div className="min-w-0">
        <p className="font-semibold">
          <Link href={`/loans/${loan.id}`} className="text-ink hover:text-maroon hover:underline">
            {loan.item.name}
          </Link>
        </p>
        <p className="text-sm text-muted">
          {showBorrower ? `${loan.borrower.name} · ` : ""}
          Due {formatDateOnly(loan.agreedDueDate)}
        </p>
      </div>
      <LoanStatusBadge status={loan.status} overdue={loan.overdue} />
    </li>
  );
}

// FR-24: pending requests, active loans, and overdue loans.
async function StaffDashboard({ user }: { user: Actor }) {
  const [pending, active, overdue] = await Promise.all([
    listRequests(user, { status: RequestStatus.Pending, page: 1 }),
    listLoans(user, { status: LoanStatus.Active, page: 1 }),
    listLoans(user, { overdue: true, page: 1 }),
  ]);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Pending requests" value={pending.total} href="/staff/requests" />
        <Stat label="Active loans" value={active.total} href="/staff/loans" />
        <Stat label="Overdue loans" value={overdue.total} href="/staff/loans?overdue=true" alert />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Panel
          title="Pending requests"
          total={pending.total}
          href="/staff/requests"
          empty="No requests are waiting."
        >
          {pending.requests.slice(0, PREVIEW_SIZE).map((request) => (
            <RequestRow key={request.id} request={request} showBorrower />
          ))}
        </Panel>
        <Panel
          title="Active loans"
          total={active.total}
          href="/staff/loans"
          empty="Nothing is checked out."
        >
          {active.loans.slice(0, PREVIEW_SIZE).map((loan) => (
            <LoanRow key={loan.id} loan={loan} showBorrower />
          ))}
        </Panel>
        <Panel
          title="Overdue loans"
          total={overdue.total}
          href="/staff/loans?overdue=true"
          empty="Nothing is overdue."
        >
          {overdue.loans.slice(0, PREVIEW_SIZE).map((loan) => (
            <LoanRow key={loan.id} loan={loan} showBorrower />
          ))}
        </Panel>
      </div>
    </>
  );
}

// FR-24, FR-04: the borrower's own request statuses and active loans.
async function BorrowerDashboard({ user }: { user: Actor }) {
  const [requests, active, overdue] = await Promise.all([
    listRequests(user, { page: 1 }),
    listLoans(user, { status: LoanStatus.Active, page: 1 }),
    // listLoans keeps a borrower to their own loans (FR-04).
    listLoans(user, { overdue: true, page: 1 }),
  ]);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Items checked out" value={active.total} href="/loans" />
        <Stat label="Requests made" value={requests.total} href="/requests" />
        <Stat label="Overdue, please return" value={overdue.total} href="/loans" alert />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Panel
          title="My active loans"
          total={active.total}
          href="/loans"
          empty="You have no items checked out."
        >
          {active.loans.slice(0, PREVIEW_SIZE).map((loan) => (
            <LoanRow key={loan.id} loan={loan} showBorrower={false} />
          ))}
        </Panel>
        <Panel
          title="My requests"
          total={requests.total}
          href="/requests"
          empty="You have not requested anything yet."
        >
          {requests.requests.slice(0, PREVIEW_SIZE).map((request) => (
            <RequestRow key={request.id} request={request} showBorrower={false} />
          ))}
        </Panel>
      </div>
    </>
  );
}

async function DashboardContent() {
  const user = await requirePageUser(); // FR-01

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border-b-4 border-gold bg-sand p-6">
        <div>
          <h1 className="page-title">Welcome, {user.name}</h1>
          <p className="mt-1 text-muted">
            Signed in as {user.email}{" "}
            <span className="ml-1 rounded-full bg-maroon px-2.5 py-0.5 text-xs font-semibold text-cream">
              {user.role}
            </span>
          </p>
        </div>
        {isStaff(user.role) ? (
          <Link href="/staff/requests" className="button-primary">
            Review requests
          </Link>
        ) : (
          <Link href="/catalog" className="button-primary">
            Browse the catalog
          </Link>
        )}
      </div>
      {isStaff(user.role) ? <StaffDashboard user={user} /> : <BorrowerDashboard user={user} />}
    </>
  );
}

export default function DashboardPage() {
  return (
    <Page>
      <Suspense fallback={<p>Loading your dashboard…</p>}>
        <DashboardContent />
      </Suspense>
    </Page>
  );
}
