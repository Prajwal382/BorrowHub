import { sealData } from "iron-session";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { getSessionOptions } from "@/lib/auth/session-config";
import { proxy } from "@/proxy";

function requestFor(path: string, cookie?: string) {
  const { cookieName } = getSessionOptions();
  return new NextRequest(`http://localhost${path}`, {
    headers: cookie ? { cookie: `${cookieName}=${cookie}` } : {},
  });
}

function validCookie() {
  return sealData({ userId: "user-1" }, { password: getSessionOptions().password });
}

describe("proxy route protection (FR-01)", () => {
  it.each(["/", "/login", "/register", "/api/auth/login", "/api/auth/register"])(
    "leaves %s public",
    async (path) => {
      const response = await proxy(requestFor(path));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("redirects a signed-out page visit to login and remembers the path", async () => {
    const response = await proxy(requestFor("/admin/users?page=2"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fadmin%2Fusers%3Fpage%3D2",
    );
  });

  it("answers a signed-out API call with 401, not a redirect", async () => {
    const response = await proxy(requestFor("/api/auth/me"));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("protects routes that do not exist yet by default", async () => {
    expect((await proxy(requestFor("/some/future/page"))).status).toBe(307);
    expect((await proxy(requestFor("/api/some/future/route"))).status).toBe(401);
  });

  it("lets a valid session through", async () => {
    const response = await proxy(requestFor("/dashboard", await validCookie()));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("treats a tampered cookie as signed out", async () => {
    const cookie = await validCookie();
    const response = await proxy(requestFor("/dashboard", `${cookie.slice(0, -4)}AAAA`));
    expect(response.status).toBe(307);
  });

  it("treats a cookie sealed with another secret as signed out", async () => {
    const cookie = await sealData(
      { userId: "user-1" },
      { password: "a-different-secret-that-is-also-32-characters" },
    );
    expect((await proxy(requestFor("/dashboard", cookie))).status).toBe(307);
  });
});
