import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RoleSelect } from "@/components/admin/RoleSelect";
import { TextField } from "@/components/forms/TextField";
import { ClearItemForm } from "@/components/items/ClearItemForm";
import { ItemForm } from "@/components/items/ItemForm";
import { CheckoutForm } from "@/components/loans/CheckoutForm";
import { ReturnForm } from "@/components/loans/ReturnForm";
import { RequestActions } from "@/components/requests/RequestActions";
import { RequestForm } from "@/components/requests/RequestForm";
import { ItemStatus, RequestStatus, Role } from "@/generated/prisma/enums";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const dates = { today: "2026-10-31", defaultDueDate: "2026-11-03" };

const forms: [string, ReactElement][] = [
  [
    "RequestForm",
    createElement(RequestForm, { itemId: "i", itemName: "Camera", minReturnDate: "2026-11-01" }),
  ],
  [
    "CheckoutForm",
    createElement(CheckoutForm, {
      requestId: "r",
      itemName: "Camera",
      borrowerName: "Riley",
      onCancel: () => {},
      ...dates,
    }),
  ],
  [
    "ReturnForm",
    createElement(ReturnForm, {
      loanId: "l",
      itemName: "Camera",
      today: dates.today,
      checkoutDate: "2026-10-20",
    }),
  ],
  ["ItemForm", createElement(ItemForm, { categories: ["Cameras"] })],
  [
    "ClearItemForm",
    createElement(ClearItemForm, { itemId: "i", itemName: "Camera", conditionNotes: "" }),
  ],
];

describe.each(forms)("%s (NFR-04)", (_name, form) => {
  const html = renderToStaticMarkup(form);

  it("cannot be submitted before hydration", () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  it("labels every text input, text area, and select", () => {
    const ids = [...html.matchAll(/<(?:input|textarea|select)[^>]*\sid="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(html).toContain(`<label for="${id}"`);
    }
  });

  it("explains the required mark whenever it uses one", () => {
    expect(html.includes('aria-hidden="true">*')).toBe(
      html.includes("Fields marked * are required"),
    );
  });
});

describe("TextField (NFR-04)", () => {
  const render = (props: { errors?: string[]; required?: boolean; hint?: string }) =>
    renderToStaticMarkup(createElement(TextField, { name: "name", label: "Name", ...props }));

  it("marks a required field for both sighted and screen reader users", () => {
    const html = render({});
    expect(html).toContain('aria-hidden="true">*');
    expect(html).toMatch(/<input[^>]*required/);
  });

  it("says when a field is optional", () => {
    const html = render({ required: false });
    expect(html).toContain("(optional)");
    expect(html).not.toMatch(/<input[^>]*required/);
  });

  it("links the error and the hint to the input", () => {
    const html = render({ errors: ["Enter a name."], hint: "Your full name." });
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1].split(" ") ?? [];

    expect(html).toContain('aria-invalid="true"');
    expect(describedBy).toHaveLength(2);
    expect(html).toContain(`id="${describedBy[0]}" class="text-sm opacity-80">Your full name.`);
    expect(html).toContain(`id="${describedBy[1]}" class="error-text text-sm">Enter a name.`);
  });
});

describe("ReturnForm", () => {
  it("does not choose the item's outcome for staff (FR-21)", () => {
    const html = renderToStaticMarkup(forms[2][1]);
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).not.toMatch(/type="radio"[^>]*checked/);
  });

  it("does not offer future return dates, which the server would refuse (FR-20)", () => {
    expect(renderToStaticMarkup(forms[2][1])).toContain('max="2026-10-31"');
  });
});

describe("RoleSelect (NFR-04)", () => {
  // Arrow keys change a select's value, so saving on change would apply every role passed through.
  it("waits for an explicit save rather than saving on change", () => {
    const html = renderToStaticMarkup(
      createElement(RoleSelect, { userId: "u", userName: "Riley", role: Role.Borrower }),
    );
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    expect(html).toContain('aria-label="Role for Riley"');
  });
});

describe("RequestActions", () => {
  const render = (status: RequestStatus, itemAvailable = true) =>
    renderToStaticMarkup(
      createElement(RequestActions, {
        requestId: "r",
        itemName: "Camera",
        borrowerName: "Riley",
        status,
        itemAvailable,
        ...dates,
      }),
    );

  it("offers approval and rejection for a pending request", () => {
    const html = render(RequestStatus.Pending);
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
  });

  it("explains why a request for an unavailable item cannot be approved (FR-13)", () => {
    expect(render(RequestStatus.Pending, false)).toContain("It cannot be approved until");
  });

  it("offers checkout and cancellation for a hold", () => {
    const html = render(RequestStatus.Approved);
    expect(html).toContain("Check out");
    expect(html).toContain("Cancel hold");
  });

  it.each([RequestStatus.Rejected, RequestStatus.Cancelled, RequestStatus.Fulfilled])(
    "offers nothing for a finished request (%s)",
    (status) => {
      expect(render(status)).not.toContain("<button");
    },
  );
});

it("ItemForm only offers statuses an administrator may choose (FR-05, INV-02)", () => {
  const html = renderToStaticMarkup(forms[3][1]);
  expect(html).toContain(`value="${ItemStatus.Available}"`);
  expect(html).toContain(`value="${ItemStatus.Unavailable}"`);
  expect(html).not.toContain(`value="${ItemStatus.Held}"`);
  expect(html).not.toContain(`value="${ItemStatus.CheckedOut}"`);
});
