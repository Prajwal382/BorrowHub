import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ItemForm } from "@/components/items/ItemForm";
import { Role } from "@/generated/prisma/enums";
import { requirePageRole } from "@/lib/auth/guards";
import { NotFoundError } from "@/lib/errors";
import { getItem, listCategories } from "@/lib/services/itemService";

export const metadata: Metadata = { title: "Edit item | BorrowHub" };

async function EditItemContent({ params }: Pick<PageProps<"/admin/items/[id]/edit">, "params">) {
  const admin = await requirePageRole(Role.Administrator); // FR-02, FR-05
  const { id } = await params;
  const [item, categories] = await Promise.all([
    getItem(id, admin.role).catch((error) => {
      if (error instanceof NotFoundError) {
        notFound();
      }
      throw error;
    }),
    listCategories(),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight break-words">Edit {item.name}</h1>
      {/* The key reloads the form's starting values after a save, as this page stays alive. */}
      <ItemForm
        key={item.updatedAt.toISOString()}
        categories={categories}
        item={{ ...item, conditionNotes: item.conditionNotes ?? "" }}
      />
    </>
  );
}

export default function EditItemPage({ params }: PageProps<"/admin/items/[id]/edit">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <Suspense fallback={<p>Loading…</p>}>
        <EditItemContent params={params} />
      </Suspense>
    </main>
  );
}
