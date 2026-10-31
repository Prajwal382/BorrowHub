import type { Metadata } from "next";
import { Suspense } from "react";
import { RoleSelect } from "@/components/admin/RoleSelect";
import { Role } from "@/generated/prisma/enums";
import { requirePageRole } from "@/lib/auth/guards";
import { listUsers } from "@/lib/services/userService";

export const metadata: Metadata = { title: "Users | BorrowHub" };

async function UsersContent() {
  const admin = await requirePageRole(Role.Administrator); // FR-02, FR-03, AC-06
  const users = await listUsers();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-foreground/30">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">
                Name
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Email
              </th>
              <th scope="col" className="py-2 font-medium">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-foreground/10">
                <td className="py-2 pr-4">{user.name}</td>
                <td className="py-2 pr-4">{user.email}</td>
                <td className="py-2">
                  {user.id === admin.id ? (
                    <span>{user.role} (you)</span>
                  ) : (
                    <RoleSelect userId={user.id} userName={user.name} role={user.role} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-12">
      <Suspense fallback={<p>Loading…</p>}>
        <UsersContent />
      </Suspense>
    </main>
  );
}
