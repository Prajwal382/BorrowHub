import { afterEach, describe, expect, it, vi } from "vitest";
import { apiHandler } from "@/lib/api/handler";
import { ConflictError, ValidationError } from "@/lib/errors";

const request = new Request("http://localhost/api/test");
const noContext = undefined as never;

function handlerThatThrows(error: unknown) {
  return apiHandler(async () => {
    throw error;
  });
}

describe("apiHandler (NFR-02)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes a successful response through", async () => {
    const handler = apiHandler(async () => Response.json({ ok: true }));
    expect((await handler(request, noContext)).status).toBe(200);
  });

  it("turns an expected failure into its status and message", async () => {
    const response = await handlerThatThrows(new ConflictError("Already taken."))(
      request,
      noContext,
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({
      code: "CONFLICT",
      message: "Already taken.",
    });
  });

  it("includes field errors", async () => {
    const error = new ValidationError("Check the form.", { name: ["Enter a name."] });
    const response = await handlerThatThrows(error)(request, noContext);

    expect((await response.json()).error.fields).toEqual({ name: ["Enter a name."] });
  });

  it("logs an unexpected failure and hides its details from the client", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("connection string with a password");

    const response = await handlerThatThrows(failure)(request, noContext);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("password");
    expect(log).toHaveBeenCalledWith(failure);
  });

  // During a build, connection() rejects with this to stop the prerender. Treating it as a
  // failure would log a false error and answer the prerender with a 500.
  it.each([
    "HANGING_PROMISE_REJECTION",
    "NEXT_REDIRECT;replace;/login;307;",
    "DYNAMIC_SERVER_USAGE",
  ])("lets the Next.js control signal %s through", async (digest) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const signal = Object.assign(new Error("internal signal"), { digest });

    await expect(handlerThatThrows(signal)(request, noContext)).rejects.toBe(signal);
    expect(log).not.toHaveBeenCalled();
  });
});
