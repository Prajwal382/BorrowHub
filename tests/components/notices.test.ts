import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoticeToast } from "@/components/feedback/NoticeToast";
import {
  currentNotice,
  dismissNotice,
  showNotice,
  subscribeToNotices,
} from "@/components/feedback/notices";

vi.mock("next/navigation", () => ({ usePathname: () => "/staff/requests" }));

describe("notices (NFR-04)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { pathname: "/staff/requests" } });
  });

  afterEach(() => {
    dismissNotice();
    vi.unstubAllGlobals();
  });

  it("belongs to the current page unless told otherwise", () => {
    showNotice("Approved.");
    expect(currentNotice()).toEqual({
      text: "Approved.",
      tone: "success",
      path: "/staff/requests",
    });
  });

  it("can belong to the page a form is about to navigate to", () => {
    showNotice("Checked out.", { path: "/staff/loans" });
    expect(currentNotice()?.path).toBe("/staff/loans");
  });

  it("replaces the previous message", () => {
    showNotice("First.");
    showNotice("Someone else got there first.", { tone: "error" });
    expect(currentNotice()).toMatchObject({
      text: "Someone else got there first.",
      tone: "error",
    });
  });

  it("tells subscribers about changes until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToNotices(listener);

    showNotice("One.");
    dismissNotice();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    showNotice("Two.");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  // Screen readers announce changes to a live region, not a live region that has just appeared.
  it("keeps its live regions in the page before there is anything to announce", () => {
    const html = renderToStaticMarkup(createElement(NoticeToast));
    expect(html).toContain('role="status"');
    expect(html).toContain('role="alert"');
  });
});
