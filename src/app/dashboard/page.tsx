import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
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
    <section className="flex flex-col gap-3 rounded-md border border-foreground/20 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {title} <span className="font-normal">({total})</span>
        </h2>
        {total > 0 && (
          <Link href={href} className="underline">
            View all<span className="sr-only"> {title.toLowerCase()}</span>
          </Link>
        )}
      </div>
      {total === 0 ? <p>{empty}</p> : <ul className="flex flex-col gap-3">{children}</ul>}
    </section>
  );
}

function RequestRow({ request, showBorrower }: { request: RequestView; showBorrower: boolean }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-medium break-words">{request.item.name}</p>
        <p className="text-sm break-words opacity-80">
          {showBorrower ? `${request.borrower.name} · ` : ""}
          Return by {formatDateOnly(request.requestedReturnDate)}
        </p>
      </div>
      <RequestStatusBadge status={request.status} />
    </li>
  );
}

function LoanRow({ loan, showBorrower }: { loan: LoanView; showBorrower: boolean }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-medium break-words">
          <Link href={`/loans/${loan.id}`} className="underline">
            {loan.item.name}
          </Link>
        </p>
        <p className="text-sm break-words opacity-80">
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
    <div className="grid gap-4 md:grid-cols-3">
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
  );
}

// FR-24, FR-04: the borrower's own request statuses and active loans.
async function BorrowerDashboard({ user }: { user: Actor }) {
  const [requests, active] = await Promise.all([
    listRequests(user, { page: 1 }),
    listLoans(user, { status: LoanStatus.Active, page: 1 }),
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
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
  );
}

async function DashboardContent() {
  const user = await requirePageUser(); // FR-01

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
        <p>
          Signed in as {user.email} ({user.role})
        </p>
      </div>
      {isStaff(user.role) ? <StaffDashboard user={user} /> : <BorrowerDashboard user={user} />}
    </>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-12">
      <Suspense fallback={<p>Loading your dashboard…</p>}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
