import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendJson } from "@/lib/api/client";

function respondWith(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status })));
}

describe("sendJson (NFR-02)", () => {
  const assign = vi.fn();

  beforeEach(() => {
    assign.mockReset();
    vi.stubGlobal("window", {
      location: { pathname: "/staff/requests", search: "?status=Pending", assign },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the data from a successful response", async () => {
    respondWith(200, { item: { id: "1" } });
    expect(await sendJson("/api/items", "POST", {})).toEqual({
      ok: true,
      data: { item: { id: "1" } },
    });
  });

  it("returns the server's message and field errors", async () => {
    const fields = { name: ["Enter a name."] };
    respondWith(400, { error: { message: "Please correct the highlighted fields.", fields } });
    expect(await sendJson("/api/items", "POST", {})).toEqual({
      ok: false,
      message: "Please correct the highlighted fields.",
      fields,
    });
  });

  it("has a message for a response that is not the expected shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })));
    expect(await sendJson("/api/items", "POST", {})).toMatchObject({
      ok: false,
      message: "Something went wrong. Please try again.",
    });
  });

  it("tells people to check their connection when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await sendJson("/api/items", "POST", {})).toMatchObject({
      ok: false,
      message: "Could not reach the server. Check your connection.",
    });
  });

  it("sends someone whose session ended to log in, then back to this page", async () => {
    respondWith(401, { error: { message: "Please log in to continue." } });

    const result = await sendJson("/api/requests/1/approve", "POST");

    expect(assign).toHaveBeenCalledWith("/login?next=%2Fstaff%2Frequests%3Fstatus%3DPending");
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("session") });
  });

  it("shows a wrong password as an error rather than redirecting", async () => {
    respondWith(401, { error: { message: "Incorrect email or password." } });

    const result = await sendJson("/api/auth/login", "POST", {});

    expect(assign).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, message: "Incorrect email or password." });
  });
});
