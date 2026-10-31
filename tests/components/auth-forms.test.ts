import { createElement, Fragment, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// Next.js keeps visited pages in the DOM, so a label could otherwise focus a hidden field.
it("gives every element a unique ID when two forms are on the page (NFR-04)", () => {
  const html = renderToStaticMarkup(
    createElement(Fragment, null, createElement(LoginForm), createElement(RegisterForm)),
  );
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
});

// Before hydration the browser handles the form itself. If it could submit then, a default
// GET would put the password in the URL, and so in browser history and server logs.
describe.each<[string, ComponentType]>([
  ["LoginForm", LoginForm],
  ["RegisterForm", RegisterForm],
])("%s before hydration (NFR-01)", (_name, Form) => {
  const html = renderToStaticMarkup(createElement(Form));

  it("cannot be submitted", () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  it("would use POST rather than putting credentials in the URL", () => {
    expect(html).toMatch(/<form[^>]*method="post"/);
  });

  it("labels every input (NFR-04)", () => {
    const inputIds = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(inputIds.length).toBeGreaterThan(0);
    for (const id of inputIds) {
      expect(html).toContain(`<label for="${id}"`);
    }
  });
});
