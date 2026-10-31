import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as approve } from "@/app/api/requests/[id]/approve/route";
import { POST as cancelHoldRoute } from "@/app/api/requests/[id]/cancel-hold/route";
import { POST as reject } from "@/app/api/requests/[id]/reject/route";
import { GET as show } from "@/app/api/requests/[id]/route";
import { GET as list, POST as create } from "@/app/api/requests/route";
import { POST as login } from "@/app/api/auth/login/route";
import { ItemStatus, RequestStatus, Role } from "@/generated/prisma/client";
import { addDays, orgToday, toDateOnlyString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { cookieJar } from "../cookie-jar";
import { createTestItem, createUser, jsonRequest, resetDatabase, TEST_PASSWORD } from "../helpers";

const noContext = undefined as never;
const tomorrow = () => toDateOnlyString(addDays(orgToday(), 1));

function logInAs(user: { email: string }) {
  cookieJar.clear();
  return login(jsonRequest("POST", { email: user.email, password: TEST_PASSWORD }), noContext);
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const listRequests = (search = "") =>
  list(new Request(`http://localhost/api/requests${search}`), noContext);
const submit = (body: unknown) => create(jsonRequest("POST", body), noContext);
const showRequest = (id: string) => show(new Request("http://localhost/x"), params(id));
const approveRequest = (id: string) => approve(new Request("http://localhost/x"), params(id));
const cancel = (id: string) => cancelHoldRoute(new Request("http://localhost/x"), params(id));
const rejectRequest = (id: string, body: unknown) => reject(jsonRequest("POST", body), params(id));

async function fixtures() {
  const [borrower, other, staff, admin, item] = await Promise.all([
    createUser("borrower"),
    createUser("other"),
    createUser("staff", Role.Staff),
    createUser("admin", Role.Administrator),
    createTestItem("CAM-1"),
  ]);
  return { borrower, other, staff, admin, item };
}

async function submitAs(user: { email: string }, itemId: string) {
  await logInAs(user);
  const response = await submit({
    itemId,
    intendedUse: "Class project",
    requestedReturnDate: tomorrow(),
  });
  return (await response.json()).request.id as string;
}

describe("requests API", () => {
  beforeEach(async () => {
    cookieJar.clear();
    await resetDatabase();
  });
  afterAll(() => prisma.$disconnect());

  it("rejects every operation when signed out (FR-01)", async () => {
    const { item } = await fixtures();

    expect((await listRequests()).status).toBe(401);
    expect((await submit({ itemId: item.id })).status).toBe(401);
    expect((await showRequest("x")).status).toBe(401);
    expect((await approveRequest("x")).status).toBe(401);
    expect((await rejectRequest("x", { reason: "No" })).status).toBe(401);
    expect((await cancel("x")).status).toBe(401);
  });

  describe("submitting (FR-09, FR-10)", () => {
    it("lets a borrower submit, shown to them and to staff (AC-01)", async () => {
      const { borrower, staff, item } = await fixtures();
      const id = await submitAs(borrower, item.id);

      const mine = await (await listRequests()).json();
      expect(mine.requests.map((request: { id: string }) => request.id)).toEqual([id]);
      expect(mine.requests[0].status).toBe(RequestStatus.Pending);

      await logInAs(staff);
      const all = await (await listRequests()).json();
      expect(all.requests.map((request: { id: string }) => request.id)).toEqual([id]);
    });

    it.each(["staff", "admin"] as const)(
      "refuses a submission from %s (FR-02, SRS 2.1)",
      async (key) => {
        const users = await fixtures();
        await logInAs(users[key]);

        const response = await submit({
          itemId: users.item.id,
          intendedUse: "Use",
          requestedReturnDate: tomorrow(),
        });

        expect(response.status).toBe(403);
        await expect(prisma.request.count()).resolves.toBe(0);
      },
    );

    it("ignores a borrower ID or status sent by the client (FR-04)", async () => {
      const { borrower, other, item } = await fixtures();
      await logInAs(borrower);

      const response = await submit({
        itemId: item.id,
        intendedUse: "Use",
        requestedReturnDate: tomorrow(),
        borrowerId: other.id,
        status: RequestStatus.Approved,
      });
      const { request } = await response.json();

      expect(request.borrowerId).toBe(borrower.id);
      expect(request.status).toBe(RequestStatus.Pending);
    });

    it("returns field errors for invalid input (NFR-02)", async () => {
      const { borrower } = await fixtures();
      await logInAs(borrower);

      const response = await submit({ itemId: "", intendedUse: " ", requestedReturnDate: "soon" });
      const { error } = await response.json();

      expect(response.status).toBe(400);
      expect(error.fields.intendedUse).toEqual(["Describe how you will use this item."]);
      expect(error.fields.requestedReturnDate).toEqual(["Choose a valid return date."]);
    });

    it("explains a return date that is not after today (FR-09)", async () => {
      const { borrower, item } = await fixtures();
      await logInAs(borrower);

      const response = await submit({
        itemId: item.id,
        intendedUse: "Use",
        requestedReturnDate: toDateOnlyString(orgToday()),
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error.fields.requestedReturnDate).toEqual([
        "Choose a return date after today.",
      ]);
    });

    it("refuses an item that is not available (FR-08)", async () => {
      const { borrower } = await fixtures();
      const held = await createTestItem("CAM-2", { status: ItemStatus.Held });
      await logInAs(borrower);

      const response = await submit({
        itemId: held.id,
        intendedUse: "Use",
        requestedReturnDate: tomorrow(),
      });
      expect(response.status).toBe(409);
    });
  });

  describe("staff-only decisions (FR-02, AC-06)", () => {
    it("are refused for borrowers, even on their own request", async () => {
      const { borrower, item } = await fixtures();
      const id = await submitAs(borrower, item.id);

      expect((await approveRequest(id)).status).toBe(403);
      expect((await rejectRequest(id, { reason: "No" })).status).toBe(403);
      expect((await cancel(id)).status).toBe(403);

      const request = await prisma.request.findUniqueOrThrow({ where: { id } });
      expect(request.status).toBe(RequestStatus.Pending);
    });

    it.each(["staff", "admin"] as const)("are allowed for %s", async (key) => {
      const users = await fixtures();
      const id = await submitAs(users.borrower, users.item.id);
      await logInAs(users[key]);

      const approved = await approveRequest(id);
      expect(approved.status).toBe(200);
      expect((await approved.json()).request.status).toBe(RequestStatus.Approved);

      const cancelled = await cancel(id);
      expect(cancelled.status).toBe(200);
      expect((await cancelled.json()).request.status).toBe(RequestStatus.Cancelled);
    });

    it("require a rejection reason (FR-11)", async () => {
      const { borrower, staff, item } = await fixtures();
      const id = await submitAs(borrower, item.id);
      await logInAs(staff);

      const response = await rejectRequest(id, { reason: "   " });

      expect(response.status).toBe(400);
      expect((await response.json()).error.fields.reason).toHaveLength(1);
    });

    it("return 409 for a decision that lost a race (AC-02)", async () => {
      const { borrower, staff, item } = await fixtures();
      const id = await submitAs(borrower, item.id);
      await logInAs(staff);

      const [first, second] = await Promise.all([approveRequest(id), approveRequest(id)]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
    });

    it("return 404 for an unknown request", async () => {
      const { staff } = await fixtures();
      await logInAs(staff);

      expect((await approveRequest("missing")).status).toBe(404);
    });
  });

  describe("ownership (FR-04, AC-06)", () => {
    it("hides another borrower's request behind the same 404 as a missing one", async () => {
      const { borrower, other, item } = await fixtures();
      const id = await submitAs(borrower, item.id);
      await logInAs(other);

      const denied = await showRequest(id);
      const missing = await showRequest("does-not-exist");

      expect(denied.status).toBe(404);
      expect(await denied.text()).toBe(await missing.text());
    });

    it("leaves another borrower's requests out of the list", async () => {
      const { borrower, other, item } = await fixtures();
      await submitAs(borrower, item.id);
      await logInAs(other);

      const body = await (await listRequests()).json();
      expect(body.total).toBe(0);
    });

    it("cannot be got around with a status filter", async () => {
      const { borrower, other, item } = await fixtures();
      await submitAs(borrower, item.id);
      await logInAs(other);

      const body = await (await listRequests(`?status=${RequestStatus.Pending}`)).json();
      expect(body.total).toBe(0);
    });

    it("shows a borrower their own request and its rejection reason (FR-11)", async () => {
      const { borrower, staff, item } = await fixtures();
      const id = await submitAs(borrower, item.id);
      await logInAs(staff);
      await rejectRequest(id, { reason: "Reserved for a class" });
      await logInAs(borrower);

      const { request } = await (await showRequest(id)).json();

      expect(request.status).toBe(RequestStatus.Rejected);
      expect(request.rejectionReason).toBe("Reserved for a class");
      expect(request).not.toHaveProperty("decidedBy");
    });

    it.each(["staff", "admin"] as const)("lets %s open any request", async (key) => {
      const users = await fixtures();
      const id = await submitAs(users.borrower, users.item.id);
      await logInAs(users[key]);

      expect((await showRequest(id)).status).toBe(200);
    });
  });

  it("does not expose password hashes in request data (NFR-01)", async () => {
    const { borrower, staff, item } = await fixtures();
    const id = await submitAs(borrower, item.id);
    await logInAs(staff);

    expect(await (await showRequest(id)).text()).not.toContain("passwordHash");
    expect(await (await listRequests()).text()).not.toContain("passwordHash");
  });
});
