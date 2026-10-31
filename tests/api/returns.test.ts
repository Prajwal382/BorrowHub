import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as clear } from "@/app/api/items/[id]/clear/route";
import { POST as returnRoute } from "@/app/api/loans/[id]/return/route";
import { GET as show } from "@/app/api/loans/[id]/route";
import { GET as list } from "@/app/api/loans/route";
import { ItemStatus, LoanStatus, Role } from "@/generated/prisma/client";
import { addDays, orgToday, toDateOnlyString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { checkoutRequest } from "@/lib/services/loanService";
import { approveRequest, createRequest } from "@/lib/services/requestService";
import { cookieJar } from "../cookie-jar";
import { createTestItem, createUser, jsonRequest, resetDatabase, TEST_PASSWORD } from "../helpers";

const noContext = undefined as never;
const dateString = (days: number) => toDateOnlyString(addDays(orgToday(), days));
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const validBody = () => ({
  returnDate: dateString(0),
  returnCondition: "Good",
  itemOutcome: ItemStatus.Available,
});

function logInAs(user: { email: string }) {
  cookieJar.clear();
  return login(jsonRequest("POST", { email: user.email, password: TEST_PASSWORD }), noContext);
}

const submitReturn = (id: string, body: unknown) =>
  returnRoute(jsonRequest("POST", body), params(id));
const clearItem = (id: string, body: unknown = {}) => clear(jsonRequest("POST", body), params(id));
const listLoans = (search = "") =>
  list(new Request(`http://localhost/api/loans${search}`), noContext);
const showLoan = (id: string) => show(new Request("http://localhost/x"), params(id));

async function fixtures() {
  const [borrower, other, staff, admin, item] = await Promise.all([
    createUser("borrower"),
    createUser("other"),
    createUser("staff", Role.Staff),
    createUser("admin", Role.Administrator),
    createTestItem("CAM-1"),
  ]);
  const request = await createRequest(borrower.id, {
    itemId: item.id,
    intendedUse: "Class project",
    requestedReturnDate: addDays(orgToday(), 7),
  });
  await approveRequest(staff.id, request.id);
  const loan = await checkoutRequest(staff.id, request.id, {
    checkoutDate: orgToday(),
    agreedDueDate: addDays(orgToday(), 7),
    checkoutCondition: "Good",
  });
  return { borrower, other, staff, admin, item, loanId: loan.id };
}

describe("returns API", () => {
  beforeEach(async () => {
    cookieJar.clear();
    await resetDatabase();
  });
  afterAll(() => prisma.$disconnect());

  it("rejects every operation when signed out (FR-01)", async () => {
    const { loanId, item } = await fixtures();

    expect((await submitReturn(loanId, validBody())).status).toBe(401);
    expect((await clearItem(item.id)).status).toBe(401);
  });

  describe("recording a return", () => {
    it.each(["borrower", "other"] as const)("is refused for %s (FR-02, AC-06)", async (key) => {
      const users = await fixtures();
      await logInAs(users[key]);

      expect((await submitReturn(users.loanId, validBody())).status).toBe(403);
      await expect(
        prisma.loan.findUniqueOrThrow({ where: { id: users.loanId } }),
      ).resolves.toMatchObject({ status: LoanStatus.Active });
    });

    it.each(["staff", "admin"] as const)("is allowed for %s (FR-20)", async (key) => {
      const users = await fixtures();
      await logInAs(users[key]);

      const response = await submitReturn(users.loanId, validBody());

      expect(response.status).toBe(200);
      const { loan } = await response.json();
      expect(loan.status).toBe(LoanStatus.Closed);
      expect(loan.item.status).toBe(ItemStatus.Available);
    });

    it("marks an item Unavailable when staff say so (AC-05)", async () => {
      const { staff, loanId } = await fixtures();
      await logInAs(staff);

      const response = await submitReturn(loanId, {
        ...validBody(),
        itemOutcome: ItemStatus.Unavailable,
      });

      expect((await response.json()).loan.item.status).toBe(ItemStatus.Unavailable);
    });

    it("returns field errors for invalid input (NFR-02)", async () => {
      const { staff, loanId } = await fixtures();
      await logInAs(staff);

      const response = await submitReturn(loanId, { returnDate: "", returnCondition: " " });
      const { error } = await response.json();

      expect(response.status).toBe(400);
      expect(error.fields.returnDate).toEqual(["Choose a return date."]);
      expect(error.fields.returnCondition).toEqual(["Describe the item's condition on return."]);
      expect(error.fields.itemOutcome).toEqual(["Choose whether this item can be lent again."]);
    });

    it("explains a return before checkout on the field (FR-20)", async () => {
      const { staff, loanId } = await fixtures();
      await logInAs(staff);

      const response = await submitReturn(loanId, { ...validBody(), returnDate: dateString(-1) });

      expect(response.status).toBe(400);
      expect((await response.json()).error.fields.returnDate).toEqual([
        "The return date cannot be before the checkout date.",
      ]);
    });

    it("returns 409 for a duplicate submission (NFR-03)", async () => {
      const { staff, loanId } = await fixtures();
      await logInAs(staff);

      const [first, second] = await Promise.all([
        submitReturn(loanId, validBody()),
        submitReturn(loanId, validBody()),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
    });

    it("returns 404 for an unknown loan", async () => {
      const { staff } = await fixtures();
      await logInAs(staff);

      expect((await submitReturn("missing", validBody())).status).toBe(404);
    });
  });

  describe("clearing an item (FR-21)", () => {
    it.each(["borrower", "other"] as const)("is refused for %s (FR-02)", async (key) => {
      const users = await fixtures();
      const broken = await createTestItem("CAM-2", { status: ItemStatus.Unavailable });
      await logInAs(users[key]);

      expect((await clearItem(broken.id)).status).toBe(403);
      await expect(
        prisma.item.findUniqueOrThrow({ where: { id: broken.id } }),
      ).resolves.toMatchObject({ status: ItemStatus.Unavailable });
    });

    it.each(["staff", "admin"] as const)("is allowed for %s", async (key) => {
      const users = await fixtures();
      const broken = await createTestItem("CAM-2", { status: ItemStatus.Unavailable });
      await logInAs(users[key]);

      const response = await clearItem(broken.id, { conditionNotes: "Repaired" });

      expect(response.status).toBe(200);
      expect((await response.json()).item).toMatchObject({
        status: ItemStatus.Available,
        conditionNotes: "Repaired",
      });
    });

    it("returns 409 for an item that is not Unavailable", async () => {
      const { staff, item } = await fixtures();
      await logInAs(staff);

      expect((await clearItem(item.id)).status).toBe(409);
    });
  });

  describe("history (FR-22, FR-23)", () => {
    async function returned() {
      const users = await fixtures();
      await logInAs(users.staff);
      await submitReturn(users.loanId, validBody());
      return users;
    }

    it("shows a borrower their own completed loan", async () => {
      const { borrower, loanId } = await returned();
      await logInAs(borrower);

      const body = await (await listLoans("?status=Closed")).json();

      expect(body.total).toBe(1);
      expect(body.loans[0].id).toBe(loanId);
      expect(body.loans[0]).not.toHaveProperty("returnedBy");
    });

    it("hides another borrower's completed loan", async () => {
      const { other, loanId, borrower } = await returned();
      await logInAs(other);

      expect((await (await listLoans("?status=Closed")).json()).total).toBe(0);
      expect((await showLoan(loanId)).status).toBe(404);
      const search = encodeURIComponent(borrower.email);
      expect((await (await listLoans(`?status=Closed&q=${search}`)).json()).total).toBe(0);
    });

    it.each(["staff", "admin"] as const)("lets %s search all history", async (key) => {
      const users = await returned();
      await logInAs(users[key]);

      const search = encodeURIComponent(users.borrower.name);
      const body = await (await listLoans(`?status=Closed&q=${search}`)).json();

      expect(body.total).toBe(1);
      expect(body.loans[0].returnedBy.name).toBe("staff");
    });
  });
});
