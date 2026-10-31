import { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/services/authService";

export const TEST_PASSWORD = "correct-horse-battery";

export async function resetDatabase() {
  await prisma.$executeRaw`TRUNCATE "AuditLog", "Loan", "Request", "Item", "User" CASCADE`;
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

export function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
