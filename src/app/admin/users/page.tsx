import type { Metadata } from "next";
import { Suspense } from "react";
import { RoleSelect } from "@/components/admin/RoleSelect";
import { Page } from "@/components/layout/Page";
import { Role } from "@/generated/prisma/enums";
import { requirePageRole } from "@/lib/auth/guards";
import { listUsers } from "@/lib/services/userService";

export const metadata: Metadata = { title: "Users | BorrowHub" };

async function UsersContent() {
  const admin = await requirePageRole(Role.Administrator); // FR-02, FR-03, AC-06
  const users = await listUsers();

  return (
    <>
      <h1 className="page-title">Users</h1>
      {/* NFR-04: cards rather than a table, so a phone does not need to scroll sideways. */}
      <ul className="flex flex-col gap-3">
        {users.map((user) => (
          <li key={user.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{user.name}</p>
              <p className="text-sm opacity-80">{user.email}</p>
            </div>
            {user.id === admin.id ? (
              <span>{user.role} (you)</span>
            ) : (
              <RoleSelect userId={user.id} userName={user.name} role={user.role} />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <Page>
      <Suspense fallback={<p>Loading…</p>}>
        <UsersContent />
      </Suspense>
    </Page>
  );
}
