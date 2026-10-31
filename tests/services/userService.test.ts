import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AuditAction, Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { changeUserRole, listUsers } from "@/lib/services/userService";
import { createUser, resetDatabase } from "../helpers";

describe("userService", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("lets an administrator change a role and audits it (FR-03, NFR-06)", async () => {
    const admin = await createUser("admin", Role.Administrator);
    const borrower = await createUser("borrower");

    const updated = await changeUserRole(admin.id, borrower.id, Role.Staff);
    expect(updated.role).toBe(Role.Staff);

    const logs = await prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: admin.id,
      action: AuditAction.UserRoleChanged,
      entityType: "User",
      entityId: borrower.id,
      details: { from: Role.Borrower, to: Role.Staff },
    });
    expect(logs[0].createdAt).toBeInstanceOf(Date);
  });

  it("does not audit a change to the same role", async () => {
    const admin = await createUser("admin", Role.Administrator);
    const borrower = await createUser("borrower");

    await changeUserRole(admin.id, borrower.id, Role.Borrower);
    await expect(prisma.auditLog.count()).resolves.toBe(0);
  });

  it.each([Role.Borrower, Role.Staff])("refuses a role change by a %s (FR-03)", async (role) => {
    const actor = await createUser("actor", role);
    const target = await createUser("target");

    await expect(changeUserRole(actor.id, target.id, Role.Administrator)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(prisma.user.findUnique({ where: { id: target.id } })).resolves.toMatchObject({
      role: Role.Borrower,
    });
  });

  it("refuses to change your own role (FR-03)", async () => {
    const admin = await createUser("admin", Role.Administrator);
    const borrower = await createUser("borrower");

    await expect(changeUserRole(admin.id, admin.id, Role.Borrower)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(changeUserRole(borrower.id, borrower.id, Role.Staff)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("reports a missing user", async () => {
    const admin = await createUser("admin", Role.Administrator);
    await expect(changeUserRole(admin.id, "missing", Role.Staff)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("always leaves an administrator when two demote each other at once", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await resetDatabase();
      const first = await createUser("first", Role.Administrator);
      const second = await createUser("second", Role.Administrator);

      const results = await Promise.allSettled([
        changeUserRole(first.id, second.id, Role.Borrower),
        changeUserRole(second.id, first.id, Role.Borrower),
      ]);

      // The losing request must fail with a clean error, not an unexpected 500.
      for (const result of results) {
        if (result.status === "rejected") {
          expect(result.reason).toBeInstanceOf(AppError);
        }
      }
      await expect(
        prisma.user.count({ where: { role: Role.Administrator } }),
      ).resolves.toBeGreaterThanOrEqual(1);
    }
  });

  it("lists users without password hashes (NFR-01)", async () => {
    await createUser("someone");
    const [user] = await listUsers();
    expect(user).not.toHaveProperty("passwordHash");
  });
});
