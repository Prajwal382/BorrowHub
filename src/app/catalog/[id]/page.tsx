import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClearItemForm } from "@/components/items/ClearItemForm";
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
      <p>
        You already have an open request for this item. See{" "}
        <Link href="/requests" className="underline">
          My requests
        </Link>
        .
      </p>
    );
  }
  return (
    <RequestForm
      itemId={itemId}
      itemName={itemName}
      minReturnDate={toDateOnlyString(addDays(orgToday(), 1))}
    />
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
        <Link href="/catalog" className="underline">
          Back to catalog
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title">{item.name}</h1>
        <ItemStatusBadge status={item.status} />
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        <dt className="font-medium">Item ID</dt>
        <dd>{item.itemCode}</dd>
        <dt className="font-medium">Category</dt>
        <dd>{item.category}</dd>
        <dt className="font-medium">Description</dt>
        <dd className="whitespace-pre-wrap">{item.description}</dd>
        {item.conditionNotes !== undefined && (
          <>
            <dt className="font-medium">Condition notes</dt>
            <dd className="whitespace-pre-wrap">{item.conditionNotes || "None"}</dd>
          </>
        )}
      </dl>
      <p>{requestabilityMessage(requestable, user.role)}</p>
      {user.role === Role.Administrator && (
        <p>
          <Link href={`/admin/items/${item.id}/edit`} className="underline">
            Edit item
          </Link>
        </p>
      )}
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
