import { z } from "zod";
import { Role } from "@/generated/prisma/enums";

const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything past 72 bytes.

const emailSchema = z
  .string("Enter your email address.")
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254, "That email address is too long."));

// NFR-02: every input is validated on the server with an actionable message.
export const registerSchema = z.object({
  name: z
    .string("Enter your name.")
    .trim()
    .min(1, "Enter your name.")
    .max(100, "Name must be 100 characters or fewer."),
  email: emailSchema,
  password: z
    .string("Enter a password.")
    .min(8, "Password must be at least 8 characters.")
    .refine(
      (password) => Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES,
      "Password must be 72 bytes or fewer.",
    ),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string("Enter your password.").min(1, "Enter your password.").max(1024),
});

export const changeRoleSchema = z.object({
  role: z.enum(Role, "Choose a valid role."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
