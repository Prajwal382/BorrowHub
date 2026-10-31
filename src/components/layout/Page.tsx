import type { ReactNode } from "react";

const WIDTHS = {
  wide: "",
  medium: "max-w-3xl",
  narrow: "max-w-md",
};

// NFR-04: every page shares the header's left edge and spacing, whatever its content width.
export function Page({
  width = "wide",
  children,
}: {
  width?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <div className={`flex flex-col gap-5 ${WIDTHS[width]}`}>{children}</div>
    </main>
  );
}
