import type { FieldErrors } from "@/lib/errors";

export type ApiResult<Data> =
  { ok: true; data: Data } | { ok: false; message: string; fields?: FieldErrors };

// Browser helper for submitting forms to the API routes.
export async function sendJson<Data = unknown>(
  url: string,
  method: "POST" | "PATCH",
  body?: unknown,
): Promise<ApiResult<Data>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: "Could not reach the server. Check your connection." };
  }

  // NFR-02: a session that ended mid-task goes to login and returns here afterwards. The auth
  // routes are excluded because they use this status for a wrong password.
  if (response.status === 401 && !url.startsWith("/api/auth/")) {
    const { pathname, search } = window.location;
    // A full page load, for the same reason as logging out; see LogoutButton.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(`${pathname}${search}`)}`);
    return { ok: false, message: "Your session has ended. Taking you to the login page." };
  }

  const payload = await response.json().catch(() => null);
  if (response.ok) {
    return { ok: true, data: payload };
  }

  return {
    ok: false,
    message: payload?.error?.message ?? "Something went wrong. Please try again.",
    fields: payload?.error?.fields,
  };
}
