import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ItemStatusBadge } from "@/components/items/ItemStatusBadge";
import { Pagination } from "@/components/Pagination";
import { ItemStatus, Role } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/auth/guards";
import { ITEM_STATUS_LABELS } from "@/lib/itemStatus";
import { listCategories, searchItems } from "@/lib/services/itemService";
import { catalogQuerySchema, MAX_SEARCH_LENGTH, type CatalogQuery } from "@/lib/validation/items";

export const metadata: Metadata = { title: "Catalog | BorrowHub" };

function pageHref({ q, category, status }: CatalogQuery, page: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/catalog?${search}` : "/catalog";
}

function SearchForm({ query, categories }: { query: CatalogQuery; categories: string[] }) {
  const selectClass = "rounded-md border border-foreground/40 bg-background px-3 py-2";

  return (
    // The key refreshes these inputs when a link changes the filters without a full page load.
    <form
      key={pageHref(query, 1)}
      action="/catalog"
      method="get"
      role="search"
      className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="catalog-q" className="font-medium">
          Search by name or category
        </label>
        <input
          id="catalog-q"
          name="q"
          type="search"
          maxLength={MAX_SEARCH_LENGTH}
          defaultValue={query.q}
          className={selectClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="catalog-category" className="font-medium">
          Category
        </label>
        <select
          id="catalog-category"
          name="category"
          defaultValue={query.category ?? ""}
          className={selectClass}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="catalog-status" className="font-medium">
          Availability
        </label>
        <select
          id="catalog-status"
          name="status"
          defaultValue={query.status ?? ""}
          className={selectClass}
        >
          <option value="">Any</option>
          {Object.values(ItemStatus).map((status) => (
            <option key={status} value={status}>
              {ITEM_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background"
      >
        Search
      </button>
    </form>
  );
}

async function CatalogContent({ searchParams }: Pick<PageProps<"/catalog">, "searchParams">) {
  const user = await requirePageUser(); // FR-07
  const query = catalogQuerySchema.parse(await searchParams);
  const [{ items, total, page, pageCount }, categories] = await Promise.all([
    searchItems(query, user.role),
    listCategories(),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Equipment catalog</h1>
        {user.role === Role.Administrator && (
          <Link href="/admin/items/new" className="underline">
            Add item
          </Link>
        )}
      </div>

      <SearchForm query={query} categories={categories} />

      <p role="status">
        {total} {total === 1 ? "item" : "items"} found
      </p>

      {items.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-foreground/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">
                  <Link href={`/catalog/${item.id}`} className="underline">
                    {item.name}
                  </Link>
                </h2>
                <ItemStatusBadge status={item.status} />
              </div>
              <p className="text-sm opacity-80">
                {item.itemCode} · {item.category}
              </p>
              <p className="mt-2 break-words">{item.description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>No items match your search. Try different words or clear the filters.</p>
      )}

      <Pagination
        label="Catalog pages"
        page={page}
        pageCount={pageCount}
        hrefFor={(target) => pageHref(query, target)}
      />
    </>
  );
}

export default function CatalogPage({ searchParams }: PageProps<"/catalog">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-12">
      <Suspense fallback={<p>Loading the catalog…</p>}>
        <CatalogContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
