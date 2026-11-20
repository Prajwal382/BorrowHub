import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ItemIcon } from "@/components/items/ItemIcon";
import { ItemStatusBadge } from "@/components/items/ItemStatusBadge";
import { Page } from "@/components/layout/Page";
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

function SearchForm({ query }: { query: CatalogQuery }) {
  return (
    // The key refreshes these inputs when a link changes the filters without a full page load.
    <form
      key={pageHref(query, 1)}
      action="/catalog"
      method="get"
      role="search"
      // NFR-04: fixed proportions, as a select otherwise grows to fit its longest category.
      className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-sand p-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_auto] sm:items-end"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="catalog-q" className="text-sm font-semibold text-muted">
          Search by name or category
        </label>
        <input
          id="catalog-q"
          name="q"
          type="search"
          maxLength={MAX_SEARCH_LENGTH}
          defaultValue={query.q}
          className="form-input"
        />
      </div>
      {/* The category chips choose this; a new search keeps the chosen one. */}
      {query.category && <input type="hidden" name="category" value={query.category} />}
      <div className="flex flex-col gap-1">
        <label htmlFor="catalog-status" className="text-sm font-semibold text-muted">
          Availability
        </label>
        <select
          id="catalog-status"
          name="status"
          defaultValue={query.status ?? ""}
          className="form-input"
        >
          <option value="">Any</option>
          {Object.values(ItemStatus).map((status) => (
            <option key={status} value={status}>
              {ITEM_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="button-primary">
        Search
      </button>
    </form>
  );
}

function CategoryChips({ query, categories }: { query: CatalogQuery; categories: string[] }) {
  const options = [
    { label: "All", value: undefined },
    ...categories.map((c) => ({ label: c, value: c })),
  ];

  return (
    <nav aria-label="Categories" className="flex flex-wrap gap-2">
      {options.map((option) => {
        const current = (query.category ?? undefined) === option.value;
        return (
          <Link
            key={option.label}
            href={pageHref({ ...query, category: option.value }, 1)}
            aria-current={current ? "page" : undefined}
            className="flex min-h-11 items-center rounded-full border-2 border-line bg-white px-4 text-sm font-semibold text-muted hover:border-maroon hover:text-maroon aria-[current=page]:border-maroon aria-[current=page]:bg-maroon aria-[current=page]:text-cream"
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
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
        <div>
          <h1 className="page-title">Equipment catalog</h1>
          <p className="mt-1 text-muted">Find what you need and send a request in one step.</p>
        </div>
        {user.role === Role.Administrator && (
          <Link href="/admin/items/new" className="button-primary">
            Add item
          </Link>
        )}
      </div>

      <SearchForm query={query} />

      <CategoryChips query={query} categories={categories} />

      <p role="status" className="text-sm font-medium text-muted">
        {total} {total === 1 ? "item" : "items"} found
      </p>

      {items.length > 0 ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm"
            >
              <div className="flex h-28 items-center justify-center border-b border-line bg-sand text-maroon">
                <ItemIcon name={item.name} category={item.category} />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold tracking-wider text-muted uppercase">
                    {item.category} · {item.itemCode}
                  </p>
                  <ItemStatusBadge status={item.status} />
                </div>
                <h2 className="text-lg font-bold text-ink">{item.name}</h2>
                <p className="line-clamp-2 text-sm text-muted">{item.description}</p>
                <Link
                  href={`/catalog/${item.id}`}
                  aria-label={`${item.status === ItemStatus.Available ? "View and request" : "View details"}: ${item.name}`}
                  className={`mt-auto ${item.status === ItemStatus.Available ? "button-primary" : "button-secondary"}`}
                >
                  {item.status === ItemStatus.Available ? "View and request" : "View details"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card text-center">
          <p className="font-semibold text-ink">No items match your search.</p>
          <p className="mt-1 text-muted">Try different words or clear the filters.</p>
          <Link href="/catalog" className="button-secondary mt-4">
            Clear filters
          </Link>
        </div>
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
    <Page>
      <Suspense fallback={<p>Loading the catalog…</p>}>
        <CatalogContent searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}
