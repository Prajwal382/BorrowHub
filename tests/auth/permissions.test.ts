import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma/enums";
import { assertCanAccessOwnedRecord, canAccessOwnedRecord, isStaff } from "@/lib/auth/permissions";
import { safeNextPath } from "@/lib/auth/redirects";
import { NotFoundError } from "@/lib/errors";

describe("permissions (FR-02, FR-04)", () => {
  it("treats administrators as staff", () => {
    expect(isStaff(Role.Administrator)).toBe(true);
    expect(isStaff(Role.Staff)).toBe(true);
    expect(isStaff(Role.Borrower)).toBe(false);
  });

  it("limits borrowers to their own records", () => {
    const borrower = { id: "b1", role: Role.Borrower };
    expect(canAccessOwnedRecord(borrower, "b1")).toBe(true);
    expect(canAccessOwnedRecord(borrower, "b2")).toBe(false);
  });

  it.each([Role.Staff, Role.Administrator])("lets a %s see any record", (role) => {
    expect(canAccessOwnedRecord({ id: "s1", role }, "b1")).toBe(true);
  });

  it("makes a denied record look like a missing one (AC-06)", () => {
    expect(() => assertCanAccessOwnedRecord({ id: "b1", role: Role.Borrower }, "b2")).toThrow(
      NotFoundError,
    );
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/admin/users?page=2")).toBe("/admin/users?page=2");
  });

  it.each([
    null,
    "",
    "dashboard",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
  ])("rejects %s", (next) => {
    expect(safeNextPath(next)).toBe("/dashboard");
  });
});
