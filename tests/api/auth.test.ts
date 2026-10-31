import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PATCH as changeRole } from "@/app/api/admin/users/[id]/role/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as register } from "@/app/api/auth/register/route";
import { Role } from "@/generated/prisma/client";
import { getSessionOptions } from "@/lib/auth/session-config";
import { prisma } from "@/lib/db";
import { cookieJar } from "../cookie-jar";
import { createUser, jsonRequest, resetDatabase, TEST_PASSWORD } from "../helpers";

const request = new Request("http://localhost/api/test");
const noContext = undefined as never;

function logInAs(email: string) {
  return login(jsonRequest("POST", { email, password: TEST_PASSWORD }), noContext);
}

function callChangeRole(userId: string, body: unknown) {
  return changeRole(jsonRequest("PATCH", body), { params: Promise.resolve({ id: userId }) });
}

describe("auth API", () => {
  beforeEach(async () => {
    cookieJar.clear();
    await resetDatabase();
  });
  afterAll(() => prisma.$disconnect());

  describe("register", () => {
    const newUser = { name: "New", email: "new@test.local", password: TEST_PASSWORD };

    it("creates a Borrower, signs them in, and hides the hash", async () => {
      const response = await register(jsonRequest("POST", newUser), noContext);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.user).toMatchObject({ email: newUser.email, role: Role.Borrower });
      expect(body.user).not.toHaveProperty("passwordHash");
      expect((await me(request, noContext)).status).toBe(200);
    });

    it("ignores a role sent by the client (FR-03)", async () => {
      const response = await register(
        jsonRequest("POST", { ...newUser, role: Role.Administrator }),
        noContext,
      );
      expect((await response.json()).user.role).toBe(Role.Borrower);
      await expect(
        prisma.user.findUnique({ where: { email: newUser.email } }),
      ).resolves.toMatchObject({ role: Role.Borrower });
    });

    it("returns field errors for invalid input (NFR-02)", async () => {
      const response = await register(
        jsonRequest("POST", { name: " ", email: "nope", password: "short" }),
        noContext,
      );
      const { error } = await response.json();

      expect(response.status).toBe(400);
      expect(error.fields.name).toEqual(["Enter your name."]);
      expect(error.fields.email).toEqual(["Enter a valid email address."]);
      expect(error.fields.password).toEqual(["Password must be at least 8 characters."]);
      expect(cookieJar.getAll()).toHaveLength(0);
    });

    it("rejects a body that is not JSON (NFR-02)", async () => {
      const response = await register(jsonRequest("POST", "{not json"), noContext);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a duplicate email", async () => {
      await createUser("new");
      const response = await register(jsonRequest("POST", newUser), noContext);
      expect(response.status).toBe(409);
    });
  });

  describe("sessions", () => {
    it("logs in and out (FR-01)", async () => {
      const user = await createUser("borrower");

      expect((await logInAs(user.email)).status).toBe(200);
      const response = await me(request, noContext);
      expect((await response.json()).user.id).toBe(user.id);

      expect((await logout(request, noContext)).status).toBe(200);
      expect((await me(request, noContext)).status).toBe(401);
    });

    it("does not start a session after a failed login", async () => {
      const user = await createUser("borrower");
      const response = await login(
        jsonRequest("POST", { email: user.email, password: "wrong-password" }),
        noContext,
      );

      expect(response.status).toBe(401);
      expect(cookieJar.getAll()).toHaveLength(0);
    });

    it("rejects requests with no session (FR-01)", async () => {
      expect((await me(request, noContext)).status).toBe(401);
    });

    it("rejects a tampered session cookie (NFR-01)", async () => {
      const user = await createUser("borrower");
      await logInAs(user.email);
      const { cookieName } = getSessionOptions();
      const seal = cookieJar.get(cookieName)!.value;

      cookieJar.set(cookieName, `${seal.slice(0, -4)}AAAA`);
      expect((await me(request, noContext)).status).toBe(401);
    });

    it("ends access as soon as the account is gone", async () => {
      const user = await createUser("borrower");
      await logInAs(user.email);
      await prisma.user.delete({ where: { id: user.id } });

      expect((await me(request, noContext)).status).toBe(401);
    });
  });

  describe("changing roles", () => {
    it("rejects a request with no session (FR-01)", async () => {
      const target = await createUser("target");
      expect((await callChangeRole(target.id, { role: Role.Staff })).status).toBe(401);
    });

    it.each([Role.Borrower, Role.Staff])("denies a %s (FR-02, FR-03)", async (role) => {
      const actor = await createUser("actor", role);
      const target = await createUser("target");
      await logInAs(actor.email);

      const response = await callChangeRole(target.id, { role: Role.Administrator });
      const { error } = await response.json();

      expect(response.status).toBe(403);
      expect(error).not.toHaveProperty("user");
      await expect(prisma.user.findUnique({ where: { id: target.id } })).resolves.toMatchObject({
        role: Role.Borrower,
      });
    });

    it("stops a borrower making themselves an administrator (FR-03)", async () => {
      const borrower = await createUser("borrower");
      await logInAs(borrower.email);

      const response = await callChangeRole(borrower.id, { role: Role.Administrator });

      expect(response.status).toBe(403);
      await expect(prisma.user.findUnique({ where: { id: borrower.id } })).resolves.toMatchObject({
        role: Role.Borrower,
      });
    });

    it("lets an administrator change a role", async () => {
      const admin = await createUser("admin", Role.Administrator);
      const target = await createUser("target");
      await logInAs(admin.email);

      const response = await callChangeRole(target.id, { role: Role.Staff });

      expect(response.status).toBe(200);
      expect((await response.json()).user.role).toBe(Role.Staff);
    });

    it("rejects an unknown role (NFR-02)", async () => {
      const admin = await createUser("admin", Role.Administrator);
      const target = await createUser("target");
      await logInAs(admin.email);

      const response = await callChangeRole(target.id, { role: "Owner" });

      expect(response.status).toBe(400);
      expect((await response.json()).error.fields.role).toEqual(["Choose a valid role."]);
    });

    it("applies a demotion on the very next request (FR-02)", async () => {
      const admin = await createUser("admin", Role.Administrator);
      const target = await createUser("target");
      await logInAs(admin.email);
      await prisma.user.update({ where: { id: admin.id }, data: { role: Role.Borrower } });

      expect((await callChangeRole(target.id, { role: Role.Staff })).status).toBe(403);
    });
  });
});
