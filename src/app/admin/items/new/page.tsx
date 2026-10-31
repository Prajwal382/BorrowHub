import type { Metadata } from "next";
import { Suspense } from "react";
import { ItemForm } from "@/components/items/ItemForm";
import { Role } from "@/generated/prisma/enums";
import { requirePageRole } from "@/lib/auth/guards";
import { listCategories } from "@/lib/services/itemService";

export const metadata: Metadata = { title: "Add item | BorrowHub" };

async function NewItemContent() {
  await requirePageRole(Role.Administrator); // FR-02, FR-05
  const categories = await listCategories();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Add item</h1>
      <ItemForm categories={categories} />
    </>
  );
}

export default function NewItemPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <Suspense fallback={<p>Loading…</p>}>
        <NewItemContent />
      </Suspense>
    </main>
  );
}
