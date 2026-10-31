import type { Metadata } from "next";
import { Suspense } from "react";
import { ItemForm } from "@/components/items/ItemForm";
import { Page } from "@/components/layout/Page";
import { Role } from "@/generated/prisma/enums";
import { requirePageRole } from "@/lib/auth/guards";
import { listCategories } from "@/lib/services/itemService";

export const metadata: Metadata = { title: "Add item | BorrowHub" };

async function NewItemContent() {
  await requirePageRole(Role.Administrator); // FR-02, FR-05
  const categories = await listCategories();

  return (
    <>
      <h1 className="page-title">Add item</h1>
      <ItemForm categories={categories} />
    </>
  );
}

export default function NewItemPage() {
  return (
    <Page width="medium">
      <Suspense fallback={<p>Loading…</p>}>
        <NewItemContent />
      </Suspense>
    </Page>
  );
}
