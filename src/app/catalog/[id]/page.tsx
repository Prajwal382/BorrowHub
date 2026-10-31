import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ItemStatusBadge } from "@/components/items/ItemStatusBadge";
import { Role } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/auth/guards";
import { NotFoundError } from "@/lib/errors";
import { isRequestable } from "@/lib/itemStatus";
import { getItem } from "@/lib/services/itemService";

export const metadata: Metadata = { title: "Item | BorrowHub" };

async function ItemContent({ params }: Pick<PageProps<"/catalog/[id]">, "params">) {
  const user = await requirePageUser(); // FR-07
  const { id } = await params;
  const item = await getItem(id, user.role).catch((error) => {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  });

  return (
    <>
      <p>
        <Link href="/catalog" className="underline">
          Back to catalog
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{item.name}</h1>
        <ItemStatusBadge status={item.status} />
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        <dt className="font-medium">Item ID</dt>
        <dd>{item.itemCode}</dd>
        <dt className="font-medium">Category</dt>
        <dd>{item.category}</dd>
        <dt className="font-medium">Description</dt>
        <dd className="break-words whitespace-pre-wrap">{item.description}</dd>
        {item.conditionNotes !== undefined && (
          <>
            <dt className="font-medium">Condition notes</dt>
            <dd className="break-words whitespace-pre-wrap">{item.conditionNotes || "None"}</dd>
          </>
        )}
      </dl>
      {/* FR-08 */}
      <p>
        {isRequestable(item.status)
          ? "This item is available to request."
          : "This item cannot be requested right now."}
      </p>
      {user.role === Role.Administrator && (
        <p>
          <Link href={`/admin/items/${item.id}/edit`} className="underline">
            Edit item
          </Link>
        </p>
      )}
    </>
  );
}

export default function ItemPage({ params }: PageProps<"/catalog/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-12">
      <Suspense fallback={<p>Loading the item…</p>}>
        <ItemContent params={params} />
      </Suspense>
    </main>
  );
}
