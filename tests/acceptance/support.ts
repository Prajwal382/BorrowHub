import type { ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import { expect } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { addDays, orgToday, toDateOnlyString } from "@/lib/dates";
import { withCookies } from "../cookie-jar";
import { jsonRequest, TEST_PASSWORD } from "../helpers";

const noContext = undefined as never;

export const dateString = (days: number) => toDateOnlyString(addDays(orgToday(), days));
export const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });
export const emptyRequest = () => new Request("http://localhost/api/test", { method: "POST" });
export const getRequest = (search = "") => new Request(`http://localhost/api/test${search}`);
export const pageProps = <Params extends Record<string, string> = Record<string, never>>(
  params = {} as Params,
  searchParams: Record<string, string> = {},
) => ({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) });

// One signed-in person. Everything run through it uses that person's own session cookie.
export type Session = <Result>(work: () => Promise<Result>) => Promise<Result>;

export async function signIn(user: { email: string }): Promise<Session> {
  const cookies = new Map<string, string>();
  const session: Session = (work) => withCookies(cookies, work);
  const response = await session(() =>
    login(jsonRequest("POST", { email: user.email, password: TEST_PASSWORD }), noContext),
  );
  expect(response.status).toBe(200);
  return session;
}

// Renders a real page, including its database reads, and fails the way the page itself would.
export async function renderPage(page: ReactElement) {
  let failure: unknown;
  const stream = await renderToReadableStream(page, {
    onError(error) {
      failure ??= error;
    },
  });
  await stream.allReady;
  const html = await new Response(stream).text();
  if (failure) {
    throw failure;
  }
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// What Next.js throws for notFound(), which is how a page denies access (AC-06).
export const PAGE_NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
