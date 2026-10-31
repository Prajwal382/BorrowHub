import { prisma } from "@/lib/db";

export async function resetDatabase() {
  await prisma.$executeRaw`TRUNCATE "AuditLog", "Loan", "Request", "Item", "User" CASCADE`;
}
