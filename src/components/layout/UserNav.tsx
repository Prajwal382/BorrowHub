import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import { LogoutButton } from "@/components/layout/LogoutButton";
import { getCurrentUser } from "@/lib/auth/guards";

// Hiding a link is a convenience only. Pages and API routes enforce their own access (FR-02).
export async function UserNav() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <Link href="/login" className="underline">
          Log in
        </Link>
        <Link href="/register" className="underline">
          Create account
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/dashboard" className="underline">
        Dashboard
      </Link>
      <Link href="/catalog" className="underline">
        Catalog
      </Link>
      {user.role === Role.Administrator && (
        <Link href="/admin/users" className="underline">
          Users
        </Link>
      )}
      <span>
        {user.name} ({user.role})
      </span>
      <LogoutButton />
    </>
  );
}
