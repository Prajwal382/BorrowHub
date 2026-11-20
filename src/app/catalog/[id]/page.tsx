import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClearItemForm } from "@/components/items/ClearItemForm";
import { ItemIcon } from "@/components/items/ItemIcon";
import { ItemStatusBadge } from "@/components/items/ItemStatusBadge";
import { Page } from "@/components/layout/Page";
import { RequestForm } from "@/components/requests/RequestForm";
import { ItemStatus, Role } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/auth/guards";
import { isStaff } from "@/lib/auth/permissions";
import { addDays, orgToday, toDateOnlyString } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { isRequestable } from "@/lib/itemStatus";
import { getItem } from "@/lib/services/itemService";
import { hasOpenRequest } from "@/lib/services/requestService";

export const metadata: Metadata = { title: "Item | BorrowHub" };

type BorrowerRequestSectionProps = {
  itemId: string;
  itemName: string;
  userId: string;
};

async function BorrowerRequestSection({ itemId, itemName, userId }: BorrowerRequestSectionProps) {
  if (await hasOpenRequest(userId, itemId)) {
    return (
      <p className="card">
        You already have an open request for this item. See{" "}
        <Link href="/requests" className="link">
          My requests
        </Link>
        .
      </p>
    );
  }
  return (
    <section className="card">
      <RequestForm
        itemId={itemId}
        itemName={itemName}
        minReturnDate={toDateOnlyString(addDays(orgToday(), 1))}
      />
    </section>
  );
}

// Staff and administrators do not make requests, so they are told what borrowers can do.
function requestabilityMessage(requestable: boolean, role: Role) {
  if (role === Role.Borrower) {
    return requestable
      ? "This item is available to request."
      : "This item cannot be requested right now.";
  }
  return requestable
    ? "Borrowers can request this item."
    : "Borrowers cannot request this item right now.";
}

async function ItemContent({ params }: Pick<PageProps<"/catalog/[id]">, "params">) {
  const user = await requirePageUser(); // FR-07
  const { id } = await params;
  const item = await getItem(id, user.role).catch((error) => {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  });
  const requestable = isRequestable(item.status); // FR-08

  return (
    <>
      <p>
        <Link href="/catalog" className="link">
          Back to catalog
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-5 rounded-2xl border-b-4 border-gold bg-sand p-6">
        <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-white text-maroon">
          <ItemIcon name={item.name} category={item.category} size={44} />
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">
            {item.category} · {item.itemCode}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title">{item.name}</h1>
            <ItemStatusBadge status={item.status} />
          </div>
        </div>
      </div>
      <dl className="card grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
        <dt className="text-sm font-semibold text-muted">Item ID</dt>
        <dd>{item.itemCode}</dd>
        <dt className="text-sm font-semibold text-muted">Category</dt>
        <dd>{item.category}</dd>
        <dt className="text-sm font-semibold text-muted">Description</dt>
        <dd className="whitespace-pre-wrap">{item.description}</dd>
        {item.conditionNotes !== undefined && (
          <>
            <dt className="text-sm font-semibold text-muted">Condition notes</dt>
            <dd className="whitespace-pre-wrap">{item.conditionNotes || "None"}</dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium text-ink">{requestabilityMessage(requestable, user.role)}</p>
        {user.role === Role.Administrator && (
          <Link href={`/admin/items/${item.id}/edit`} className="button-secondary">
            Edit item
          </Link>
        )}
      </div>
      {/* FR-21 */}
      {isStaff(user.role) && item.status === ItemStatus.Unavailable && (
        <ClearItemForm
          key={item.updatedAt.toISOString()}
          itemId={item.id}
          itemName={item.name}
          conditionNotes={item.conditionNotes ?? ""}
        />
      )}
      {/* FR-09, SRS 2.1: requesting is a borrower function. */}
      {user.role === Role.Borrower && requestable && (
        <BorrowerRequestSection itemId={item.id} itemName={item.name} userId={user.id} />
      )}
    </>
  );
}

export default function ItemPage({ params }: PageProps<"/catalog/[id]">) {
  return (
    <Page width="medium">
      <Suspense fallback={<p>Loading the item…</p>}>
        <ItemContent params={params} />
      </Suspense>
    </Page>
  );
}
