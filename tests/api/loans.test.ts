import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as show } from "@/app/api/loans/[id]/route";
import { GET as list } from "@/app/api/loans/route";
import { POST as checkout } from "@/app/api/requests/[id]/checkout/route";
import { ItemStatus, LoanStatus, RequestStatus, Role } from "@/generated/prisma/client";
import { addDays, orgToday, toDateOnlyString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { approveRequest, createRequest } from "@/lib/services/requestService";
import { cookieJar } from "../cookie-jar";
import { createTestItem, createUser, jsonRequest, resetDatabase, TEST_PASSWORD } from "../helpers";

const noContext = undefined as never;
const dateString = (days: number) => toDateOnlyString(addDays(orgToday(), days));

const validBody = () => ({
  checkoutDate: dateString(0),
  agreedDueDate: dateString(7),
  checkoutCondition: "Good",
});

function logInAs(user: { email: string }) {
  cookieJar.clear();
  return login(jsonRequest("POST", { email: user.email, password: TEST_PASSWORD }), noContext);
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const submitCheckout = (id: string, body: unknown) =>
  checkout(jsonRequest("POST", body), params(id));
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
  return { borrower, other, staff, admin, item, requestId: request.id };
}

describe("loans API", () => {
  beforeEach(async () => {
    cookieJar.clear();
    await resetDatabase();
  });
  afterAll(() => prisma.$disconnect());

  it("rejects every operation when signed out (FR-01)", async () => {
    const { requestId } = await fixtures();

    expect((await submitCheckout(requestId, validBody())).status).toBe(401);
    expect((await listLoans()).status).toBe(401);
    expect((await showLoan("x")).status).toBe(401);
  });

  describe("checkout", () => {
    it.each(["borrower", "other"] as const)(
      "is refused for a borrower, even their own hold (FR-02, AC-06)",
      async (key) => {
        const users = await fixtures();
        await logInAs(users[key]);

        const response = await submitCheckout(users.requestId, validBody());

        expect(response.status).toBe(403);
        await expect(prisma.loan.count()).resolves.toBe(0);
      },
    );

    it.each(["staff", "admin"] as const)("is allowed for %s (AC-03)", async (key) => {
      const users = await fixtures();
      await logInAs(users[key]);

      const response = await submitCheckout(users.requestId, validBody());
      const { loan } = await response.json();

      expect(response.status).toBe(201);
      expect(loan).toMatchObject({
        status: LoanStatus.Active,
        borrowerId: users.borrower.id,
        overdue: false,
      });
      expect(loan.item.status).toBe(ItemStatus.CheckedOut);
    });

    it("ignores a different borrower sent by the client (FR-15)", async () => {
      const { borrower, other, staff, requestId } = await fixtures();
      await logInAs(staff);

      const response = await submitCheckout(requestId, { ...validBody(), borrowerId: other.id });

      expect((await response.json()).loan.borrowerId).toBe(borrower.id);
    });

    it("returns field errors for invalid input (NFR-02)", async () => {
      const { staff, requestId } = await fixtures();
      await logInAs(staff);

      const response = await submitCheckout(requestId, {
        checkoutDate: "",
        agreedDueDate: "nope",
        checkoutCondition: " ",
      });
      const { error } = await response.json();

      expect(response.status).toBe(400);
      expect(error.fields.checkoutDate).toEqual(["Choose a checkout date."]);
      expect(error.fields.agreedDueDate).toEqual(["Choose a valid return date."]);
      expect(error.fields.checkoutCondition).toHaveLength(1);
    });

    it("explains a return date before checkout on the field (FR-16)", async () => {
      const { staff, requestId } = await fixtures();
      await logInAs(staff);

      const response = await submitCheckout(requestId, {
        ...validBody(),
        agreedDueDate: dateString(-1),
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error.fields.agreedDueDate).toEqual([
        "The return date cannot be before the checkout date.",
      ]);
    });

    it("explains a future checkout date on the field", async () => {
      const { staff, requestId } = await fixtures();
      await logInAs(staff);

      const response = await submitCheckout(requestId, {
        ...validBody(),
        checkoutDate: dateString(1),
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error.fields.checkoutDate).toEqual([
        "The checkout date cannot be in the future.",
      ]);
    });

    it("returns 409 and creates one loan for a duplicate submission (NFR-03)", async () => {
      const { staff, requestId } = await fixtures();
      await logInAs(staff);

      const [first, second] = await Promise.all([
        submitCheckout(requestId, validBody()),
        submitCheckout(requestId, validBody()),
      ]);

      expect([first.status, second.status].sort()).toEqual([201, 409]);
      await expect(prisma.loan.count()).resolves.toBe(1);
    });

    it("returns 404 for an unknown request", async () => {
      const { staff } = await fixtures();
      await logInAs(staff);

      expect((await submitCheckout("missing", validBody())).status).toBe(404);
    });

    it("is refused for a request that is still Pending (FR-15)", async () => {
      const { borrower, staff } = await fixtures();
      const item = await createTestItem("CAM-2");
      const pending = await createRequest(borrower.id, {
        itemId: item.id,
        intendedUse: "Use",
        requestedReturnDate: addDays(orgToday(), 3),
      });
      await logInAs(staff);

      expect((await submitCheckout(pending.id, validBody())).status).toBe(409);
      await expect(
        prisma.request.findUniqueOrThrow({ where: { id: pending.id } }),
      ).resolves.toMatchObject({ status: RequestStatus.Pending });
    });
  });

  describe("viewing (FR-04, FR-18, AC-06)", () => {
    async function checkedOut() {
      const users = await fixtures();
      await logInAs(users.staff);
      const { loan } = await (await submitCheckout(users.requestId, validBody())).json();
      return { ...users, loanId: loan.id as string };
    }

    it("shows a borrower their own loan and due date (AC-03)", async () => {
      const { borrower, loanId } = await checkedOut();
      await logInAs(borrower);

      const { loans } = await (await listLoans()).json();
      const { loan } = await (await showLoan(loanId)).json();

      expect(loans).toHaveLength(1);
      expect(loan.agreedDueDate.slice(0, 10)).toBe(dateString(7));
      expect(loan).not.toHaveProperty("checkedOutBy");
    });

    it("hides another borrower's loan behind the same 404 as a missing one", async () => {
      const { other, loanId } = await checkedOut();
      await logInAs(other);

      const denied = await showLoan(loanId);
      const missing = await showLoan("does-not-exist");

      expect(denied.status).toBe(404);
      expect(await denied.text()).toBe(await missing.text());
    });

    it("leaves other borrowers' loans out of every list", async () => {
      const { other } = await checkedOut();
      await logInAs(other);

      expect((await (await listLoans()).json()).total).toBe(0);
      expect((await (await listLoans("?status=Active")).json()).total).toBe(0);
      expect((await (await listLoans("?overdue=true")).json()).total).toBe(0);
    });

    it.each(["staff", "admin"] as const)("lets %s see every loan", async (key) => {
      const users = await checkedOut();
      await logInAs(users[key]);

      expect((await (await listLoans()).json()).total).toBe(1);
      expect((await showLoan(users.loanId)).status).toBe(200);
    });

    it("shows an overdue loan to staff (AC-04)", async () => {
      const { staff, loanId } = await checkedOut();
      await prisma.loan.update({
        where: { id: loanId },
        data: { checkoutDate: addDays(orgToday(), -5), agreedDueDate: addDays(orgToday(), -1) },
      });
      await logInAs(staff);

      const body = await (await listLoans("?overdue=true")).json();

      expect(body.total).toBe(1);
      expect(body.loans[0]).toMatchObject({ id: loanId, overdue: true, status: LoanStatus.Active });
    });

    it("does not list a loan due today as overdue (FR-19)", async () => {
      const { staff, loanId } = await checkedOut();
      await prisma.loan.update({
        where: { id: loanId },
        data: { checkoutDate: addDays(orgToday(), -5), agreedDueDate: orgToday() },
      });
      await logInAs(staff);

      expect((await (await listLoans("?overdue=true")).json()).total).toBe(0);
    });

    it("does not expose password hashes (NFR-01)", async () => {
      const { staff, loanId } = await checkedOut();
      await logInAs(staff);

      expect(await (await showLoan(loanId)).text()).not.toContain("passwordHash");
    });
  });
});
