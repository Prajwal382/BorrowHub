import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, UnauthenticatedError } from "@/lib/errors";
import { authenticateUser, registerUser } from "@/lib/services/authService";
import { loginSchema, registerSchema } from "@/lib/validation/auth";
import { createUser, resetDatabase, TEST_PASSWORD } from "../helpers";

const newUser = { name: "New User", email: "new@test.local", password: TEST_PASSWORD };

describe("authService", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("registers every new account as a Borrower (FR-03)", async () => {
    const user = await registerUser(newUser);
    expect(user.role).toBe(Role.Borrower);
  });

  it("stores a salted bcrypt hash, never the password (NFR-01)", async () => {
    await registerUser(newUser);
    await registerUser({ ...newUser, email: "other@test.local" });
    const [first, second] = await prisma.user.findMany();

    expect(first.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(first.passwordHash).not.toContain(TEST_PASSWORD);
    expect(first.passwordHash).not.toBe(second.passwordHash);
  });

  it("never returns the password hash", async () => {
    const registered = await registerUser(newUser);
    const authenticated = await authenticateUser(newUser);
    expect(registered).not.toHaveProperty("passwordHash");
    expect(authenticated).not.toHaveProperty("passwordHash");
  });

  it("treats email addresses as case-insensitive", async () => {
    await registerUser(registerSchema.parse(newUser));
    await expect(
      registerUser(registerSchema.parse({ ...newUser, email: " NEW@Test.Local " })),
    ).rejects.toBeInstanceOf(ConflictError);

    const login = loginSchema.parse({ email: "NEW@TEST.LOCAL", password: TEST_PASSWORD });
    await expect(authenticateUser(login)).resolves.toMatchObject({ email: "new@test.local" });
  });

  it("logs in with the right password", async () => {
    const user = await createUser("known", Role.Staff);
    await expect(
      authenticateUser({ email: user.email, password: TEST_PASSWORD }),
    ).resolves.toMatchObject({ id: user.id, role: Role.Staff });
  });

  it("gives the same error for a wrong password and an unknown email (FR-01)", async () => {
    const user = await createUser("known");
    const wrongPassword = await authenticateUser({
      email: user.email,
      password: "wrong-password",
    }).catch((error) => error);
    const unknownEmail = await authenticateUser({
      email: "nobody@test.local",
      password: TEST_PASSWORD,
    }).catch((error) => error);

    expect(wrongPassword).toBeInstanceOf(UnauthenticatedError);
    expect(unknownEmail).toBeInstanceOf(UnauthenticatedError);
    expect(wrongPassword.message).toBe(unknownEmail.message);
  });
});

describe("password rules (NFR-02)", () => {
  it("rejects a short password", () => {
    expect(registerSchema.safeParse({ ...newUser, password: "short" }).success).toBe(false);
  });

  it("rejects a password longer than bcrypt can use", () => {
    expect(registerSchema.safeParse({ ...newUser, password: "x".repeat(73) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...newUser, password: "é".repeat(37) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...newUser, password: "x".repeat(72) }).success).toBe(true);
  });
});
