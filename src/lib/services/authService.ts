import bcrypt from "bcrypt";
import { Prisma, Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, UnauthenticatedError } from "@/lib/errors";
import { publicUserSelect, type PublicUser } from "@/lib/services/userService";
import type { LoginInput, RegisterInput } from "@/lib/validation/auth";

const BCRYPT_ROUNDS = 12;

// NFR-01: bcrypt generates a unique salt per hash; plaintext is never stored.
export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// FR-03: self-registration always creates a Borrower, whatever the request contained.
export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: Role.Borrower },
      select: publicUserSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("An account with this email already exists. Try logging in.");
    }
    throw error;
  }
}

let dummyHash: Promise<string> | undefined;

// FR-01: unknown emails still run a bcrypt comparison, so response time and the error
// message do not reveal which email addresses have accounts.
export async function authenticateUser(input: LoginInput): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...publicUserSelect, passwordHash: true },
  });

  dummyHash ??= hashPassword("placeholder-for-unknown-accounts");
  const matches = await bcrypt.compare(input.password, user?.passwordHash ?? (await dummyHash));

  if (!user || !matches) {
    throw new UnauthenticatedError("Incorrect email or password.");
  }

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
