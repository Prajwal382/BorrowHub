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
