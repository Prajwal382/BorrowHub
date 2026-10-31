import { Role } from "@/generated/prisma/enums";
import { LogoutButton } from "@/components/layout/LogoutButton";
import { NavLink } from "@/components/layout/NavLink";
import { getCurrentUser } from "@/lib/auth/guards";
import { isStaff } from "@/lib/auth/permissions";

// Hiding a link is a convenience only. Pages and API routes enforce their own access (FR-02).
export async function UserNav() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <NavLink href="/login">Log in</NavLink>
        <NavLink href="/register">Create account</NavLink>
      </>
    );
  }

  return (
    <>
      <NavLink href="/dashboard">Dashboard</NavLink>
      <NavLink href="/catalog">Catalog</NavLink>
      {user.role === Role.Borrower && (
        <>
          <NavLink href="/requests">My requests</NavLink>
          <NavLink href="/loans">My loans</NavLink>
          <NavLink href="/history">My history</NavLink>
        </>
      )}
      {isStaff(user.role) && (
        <>
          <NavLink href="/staff/requests">Requests</NavLink>
          <NavLink href="/staff/loans">Loans</NavLink>
          <NavLink href="/staff/history">History</NavLink>
        </>
      )}
      {user.role === Role.Administrator && <NavLink href="/admin/users">Users</NavLink>}
      <span>
        {user.name} ({user.role})
      </span>
      <LogoutButton />
    </>
  );
}
