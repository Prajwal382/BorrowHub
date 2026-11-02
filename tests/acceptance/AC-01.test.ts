import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listRequests, POST as submitRequest } from "@/app/api/requests/route";
import RequestsPage from "@/app/requests/page";
import StaffRequestsPage from "@/app/staff/requests/page";
import { ItemStatus, RequestStatus, Role } from "@/generated/prisma/client";
import { parseDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { createTestItem, createUser, jsonRequest, resetDatabase } from "../helpers";
import { dateString, getRequest, pageProps, renderPage, signIn } from "./support";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

const noContext = undefined as never;
const listAll = () => listRequests(getRequest(), noContext);

describe("AC-01: a borrower requests an available camera", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("AC-01: one Pending request appears to the borrower and to staff", async () => {
    const [borrowerUser, otherUser, staffUser, camera] = await Promise.all([
      createUser("blake"),
      createUser("riley"),
      createUser("sam", Role.Staff),
      createTestItem("CAM-1", { name: "Canon Camera" }),
    ]);
    const [borrower, other, staff] = await Promise.all([
      signIn(borrowerUser),
      signIn(otherUser),
      signIn(staffUser),
    ]);
    const returnDate = dateString(7);

    const response = await borrower(() =>
      submitRequest(
        jsonRequest("POST", {
          itemId: camera.id,
          intendedUse: "Filming a class project",
          requestedReturnDate: returnDate,
        }),
        noContext,
      ),
    );

    expect(response.status).toBe(201);
    const stored = await prisma.request.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      borrowerId: borrowerUser.id,
      itemId: camera.id,
      intendedUse: "Filming a class project",
      requestedReturnDate: parseDateOnly(returnDate),
      status: RequestStatus.Pending,
    });
    // A request reserves nothing until staff approve it.
    await expect(
      prisma.item.findUniqueOrThrow({ where: { id: camera.id } }),
    ).resolves.toMatchObject({ status: ItemStatus.Available });

    const requestId = stored[0].id;
    for (const viewer of [borrower, staff]) {
      const { requests } = await (await viewer(listAll)).json();
      expect(requests.map((request: { id: string }) => request.id)).toEqual([requestId]);
      expect(requests[0].status).toBe(RequestStatus.Pending);
    }

    const borrowerPage = await borrower(() => renderPage(RequestsPage(pageProps())));
    expect(borrowerPage).toContain("Canon Camera");
    expect(borrowerPage).toContain("Pending");
    expect(borrowerPage).toContain("Filming a class project");

    const staffPage = await staff(() => renderPage(StaffRequestsPage(pageProps())));
    expect(staffPage).toContain("Canon Camera");
    expect(staffPage).toContain("blake@test.local");
    expect(staffPage).toContain("1 request");

    // FR-04: nobody else can see it.
    expect((await (await other(listAll)).json()).requests).toEqual([]);
    expect(await other(() => renderPage(RequestsPage(pageProps())))).not.toContain("Canon Camera");
  });

  it.each([
    ["today", 0],
    ["a past date", -1],
  ])("AC-01: a return date of %s is refused and stores nothing (FR-09)", async (_label, days) => {
    const [user, camera] = await Promise.all([createUser("blake"), createTestItem("CAM-1")]);
    const borrower = await signIn(user);

    const response = await borrower(() =>
      submitRequest(
        jsonRequest("POST", {
          itemId: camera.id,
          intendedUse: "Filming",
          requestedReturnDate: dateString(days),
        }),
        noContext,
      ),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fields.requestedReturnDate).toHaveLength(1);
    await expect(prisma.request.count()).resolves.toBe(0);
  });

  it("AC-01: a request without a purpose is refused and stores nothing (FR-09)", async () => {
    const [user, camera] = await Promise.all([createUser("blake"), createTestItem("CAM-1")]);
    const borrower = await signIn(user);

    const response = await borrower(() =>
      submitRequest(
        jsonRequest("POST", {
          itemId: camera.id,
          intendedUse: "   ",
          requestedReturnDate: dateString(7),
        }),
        noContext,
      ),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fields.intendedUse).toHaveLength(1);
    await expect(prisma.request.count()).resolves.toBe(0);
  });
});
