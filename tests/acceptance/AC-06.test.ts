import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PATCH as changeRole } from "@/app/api/admin/users/[id]/role/route";
import { POST as clearItem } from "@/app/api/items/[id]/clear/route";
import { PATCH as updateItem } from "@/app/api/items/[id]/route";
import { POST as createItem } from "@/app/api/items/route";
import { POST as recordReturn } from "@/app/api/loans/[id]/return/route";
import { GET as showLoan } from "@/app/api/loans/[id]/route";
import { GET as listLoans } from "@/app/api/loans/route";
import { POST as approve } from "@/app/api/requests/[id]/approve/route";
import { POST as cancelHold } from "@/app/api/requests/[id]/cancel-hold/route";
import { POST as checkout } from "@/app/api/requests/[id]/checkout/route";
import { POST as reject } from "@/app/api/requests/[id]/reject/route";
import { GET as showRequest } from "@/app/api/requests/[id]/route";
import EditItemPage from "@/app/admin/items/[id]/edit/page";
import NewItemPage from "@/app/admin/items/new/page";
import AdminUsersPage from "@/app/admin/users/page";
import LoanPage from "@/app/loans/[id]/page";
import StaffHistoryPage from "@/app/staff/history/page";
import StaffLoansPage from "@/app/staff/loans/page";
import StaffRequestsPage from "@/app/staff/requests/page";
import { ItemStatus, Role } from "@/generated/prisma/client";
import { addDays, orgToday } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { checkoutRequest } from "@/lib/services/loanService";
import { approveRequest, createRequest } from "@/lib/services/requestService";
import { createTestItem, createUser, jsonRequest, resetDatabase } from "../helpers";
import {
  dateString,
  emptyRequest,
  getRequest,
  PAGE_NOT_FOUND,
  pageProps,
  renderPage,
  routeParams,
  signIn,
} from "./support";

const noContext = undefined as never;

// The owner's private details. None may ever reach another borrower.
const SECRETS = ["blake", "Private shoot", "Scratched lens cap"];

async function scenario() {
  const [owner, intruder, staff, loanedItem, heldItem, pendingItem, flaggedItem] =
    await Promise.all([
      createUser("blake"),
      createUser("riley"),
      createUser("sam", Role.Staff),
      createTestItem("CAM-1"),
      createTestItem("CAM-2"),
      createTestItem("CAM-3"),
      createTestItem("CAM-4", { status: ItemStatus.Unavailable }),
    ]);
  const request = (itemId: string) =>
    createRequest(owner.id, {
      itemId,
      intendedUse: "Private shoot",
      requestedReturnDate: addDays(orgToday(), 7),
    });

  const loanRequest = await request(loanedItem.id);
  await approveRequest(staff.id, loanRequest.id);
  const loan = await checkoutRequest(staff.id, loanRequest.id, {
    checkoutDate: orgToday(),
    agreedDueDate: addDays(orgToday(), 7),
    checkoutCondition: "Scratched lens cap",
  });
  const hold = await request(heldItem.id);
  await approveRequest(staff.id, hold.id);
  const pending = await request(pendingItem.id);

  return {
    owner,
    staff,
    loanId: loan.id,
    loanRequestId: loanRequest.id,
    holdId: hold.id,
    pendingId: pending.id,
    flaggedItemId: flaggedItem.id,
    pendingItemId: pendingItem.id,
    session: await signIn(intruder),
    intruderId: intruder.id,
  };
}

const databaseSnapshot = async () =>
  JSON.stringify(
    await Promise.all([
      prisma.user.findMany({ orderBy: { id: "asc" } }),
      prisma.item.findMany({ orderBy: { id: "asc" } }),
      prisma.request.findMany({ orderBy: { id: "asc" } }),
      prisma.loan.findMany({ orderBy: { id: "asc" } }),
      prisma.auditLog.findMany({ orderBy: { id: "asc" } }),
    ]),
  );

describe("AC-06: a borrower attempts to reach what is not theirs", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("AC-06: opening another borrower's loan is denied without exposing protected details", async () => {
    const { loanId, loanRequestId, session } = await scenario();

    const theirLoan = await session(() => showLoan(getRequest(), routeParams(loanId)));
    const noLoan = await session(() => showLoan(getRequest(), routeParams("does-not-exist")));
    const theirRequest = await session(() => showRequest(getRequest(), routeParams(loanRequestId)));
    const noRequest = await session(() => showRequest(getRequest(), routeParams("does-not-exist")));

    // Identical responses, so a borrower cannot even learn that the record exists.
    expect(theirLoan.status).toBe(404);
    expect(noLoan.status).toBe(404);
    const loanBody = await theirLoan.text();
    expect(loanBody).toBe(await noLoan.text());
    expect(theirRequest.status).toBe(404);
    const requestBody = await theirRequest.text();
    expect(requestBody).toBe(await noRequest.text());
    for (const body of [loanBody, requestBody]) {
      for (const secret of SECRETS) {
        expect(body).not.toContain(secret);
      }
    }

    await expect(
      session(() => renderPage(LoanPage(pageProps({ id: loanId })))),
    ).rejects.toMatchObject(PAGE_NOT_FOUND);
    await expect(
      session(() => renderPage(LoanPage(pageProps({ id: "does-not-exist" })))),
    ).rejects.toMatchObject(PAGE_NOT_FOUND);

    // Searching for the owner by name finds nothing either.
    const search = await session(() => listLoans(getRequest("?q=blake"), noContext));
    expect(await search.json()).toMatchObject({ loans: [], total: 0 });
  });

  it("AC-06: every staff-only and administrator action is denied and changes nothing", async () => {
    const {
      owner,
      staff,
      holdId,
      loanId,
      pendingId,
      flaggedItemId,
      pendingItemId,
      intruderId,
      session,
    } = await scenario();
    const before = await databaseSnapshot();

    const attempts: [string, () => Promise<Response>][] = [
      ["approve", () => approve(emptyRequest(), routeParams(pendingId))],
      ["reject", () => reject(jsonRequest("POST", { reason: "No" }), routeParams(pendingId))],
      ["cancel hold", () => cancelHold(emptyRequest(), routeParams(holdId))],
      [
        "check out",
        () =>
          checkout(
            jsonRequest("POST", {
              checkoutDate: dateString(0),
              agreedDueDate: dateString(5),
              checkoutCondition: "Fine",
            }),
            routeParams(holdId),
          ),
      ],
      [
        "record return",
        () =>
          recordReturn(
            jsonRequest("POST", {
              returnDate: dateString(0),
              returnCondition: "Fine",
              itemOutcome: ItemStatus.Available,
            }),
            routeParams(loanId),
          ),
      ],
      ["clear item", () => clearItem(jsonRequest("POST", {}), routeParams(flaggedItemId))],
      [
        "add item",
        () =>
          createItem(
            jsonRequest("POST", {
              itemCode: "NEW-1",
              name: "New",
              description: "New",
              category: "New",
            }),
            noContext,
          ),
      ],
      [
        "edit item",
        () => updateItem(jsonRequest("PATCH", { name: "X" }), routeParams(pendingItemId)),
      ],
      [
        "promote themselves",
        () =>
          changeRole(jsonRequest("PATCH", { role: Role.Administrator }), routeParams(intruderId)),
      ],
      [
        "change someone's role",
        () => changeRole(jsonRequest("PATCH", { role: Role.Borrower }), routeParams(staff.id)),
      ],
    ];

    for (const [action, attempt] of attempts) {
      const response = await session(attempt);
      const body = await response.text();

      expect(response.status, action).toBe(403);
      expect(JSON.parse(body).error.message, action).toBe("You do not have permission to do that.");
      for (const secret of [...SECRETS, owner.email]) {
        expect(body, action).not.toContain(secret);
      }
    }

    expect(await databaseSnapshot()).toBe(before);
  });

  it("AC-06: staff and administrator pages render as not found", async () => {
    const { pendingItemId, session } = await scenario();

    const pages: [string, () => Parameters<typeof renderPage>[0]][] = [
      ["staff requests", () => StaffRequestsPage(pageProps())],
      ["staff loans", () => StaffLoansPage(pageProps())],
      ["staff history", () => StaffHistoryPage(pageProps())],
      ["users", () => AdminUsersPage()],
      ["add item", () => NewItemPage()],
      ["edit item", () => EditItemPage(pageProps({ id: pendingItemId }))],
    ];

    for (const [name, page] of pages) {
      await expect(
        session(() => renderPage(page())),
        name,
      ).rejects.toMatchObject(PAGE_NOT_FOUND);
    }
  });

  it("AC-06: someone signed out is refused without exposing protected details", async () => {
    const { loanId, holdId } = await scenario();

    const responses = await Promise.all([
      showLoan(getRequest(), routeParams(loanId)),
      approve(emptyRequest(), routeParams(holdId)),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      const body = await response.text();
      for (const secret of SECRETS) {
        expect(body).not.toContain(secret);
      }
    }
  });
});
