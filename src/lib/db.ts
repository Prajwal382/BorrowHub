import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Reuse one client across Next.js hot reloads so dev does not exhaust connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// A transaction lost a race with another one. Prisma reports this as P2034 inside a query,
// but the pg adapter throws a raw DriverAdapterError when the conflict surfaces at commit.
export function isWriteConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034";
  }
  return (
    error instanceof Error &&
    error.name === "DriverAdapterError" &&
    (error.cause as { kind?: string } | undefined)?.kind === "TransactionWriteConflict"
  );
}
