import Link from "next/link";

type PaginationProps = {
  label: string;
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
};

export function Pagination({ label, page, pageCount, hrefFor }: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="underline">
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span>
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className="underline">
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
