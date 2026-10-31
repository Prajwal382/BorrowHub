import { ItemStatus, Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/services/authService";

export const TEST_PASSWORD = "correct-horse-battery";

export async function resetDatabase() {
  await prisma.$executeRaw`TRUNCATE "AuditLog", "Loan", "Request", "Item", "User" CASCADE`;
}

// Makes every audit write fail, to prove a transaction leaves nothing behind when it does.
export async function withFailingAuditLog(work: () => Promise<void>) {
  await prisma.$executeRaw`
    CREATE FUNCTION test_fail_audit() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'audit log unavailable'; END;
    $$ LANGUAGE plpgsql`;
  await prisma.$executeRaw`
    CREATE TRIGGER test_fail_audit BEFORE INSERT ON "AuditLog"
    FOR EACH ROW EXECUTE FUNCTION test_fail_audit()`;
  try {
    await work();
  } finally {
    await prisma.$executeRaw`DROP TRIGGER test_fail_audit ON "AuditLog"`;
    await prisma.$executeRaw`DROP FUNCTION test_fail_audit()`;
  }
}

let passwordHash: Promise<string> | undefined;

export async function createUser(key: string, role: Role = Role.Borrower) {
  passwordHash ??= hashPassword(TEST_PASSWORD);
  return prisma.user.create({
    data: {
      email: `${key}@test.local`,
      name: key,
      role,
      passwordHash: await passwordHash,
    },
  });
}

export function createTestItem(
  itemCode: string,
  overrides: Partial<{
    name: string;
    description: string;
    category: string;
    conditionNotes: string;
    status: ItemStatus;
  }> = {},
) {
  return prisma.item.create({
    data: {
      itemCode,
      name: `Item ${itemCode}`,
      description: "A test item.",
      category: "Cameras",
      ...overrides,
    },
  });
}

export function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
