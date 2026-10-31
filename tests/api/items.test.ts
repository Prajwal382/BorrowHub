import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import * as itemRoute from "@/app/api/items/[id]/route";
import * as itemsRoute from "@/app/api/items/route";
import { ItemStatus, Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { cookieJar } from "../cookie-jar";
import { createTestItem, createUser, jsonRequest, resetDatabase, TEST_PASSWORD } from "../helpers";

const noContext = undefined as never;
const validItem = {
  itemCode: "CAM-9",
  name: "Camera",
  description: "A camera.",
  category: "Cameras",
};

async function logInAs(role: Role) {
  const user = await createUser(role.toLowerCase(), role);
  await login(jsonRequest("POST", { email: user.email, password: TEST_PASSWORD }), noContext);
  return user;
}

const list = (search = "") =>
  itemsRoute.GET(new Request(`http://localhost/api/items${search}`), noContext);
const show = (id: string) =>
  itemRoute.GET(new Request("http://localhost/api/items/x"), {
    params: Promise.resolve({ id }),
  });
const create = (body: unknown) => itemsRoute.POST(jsonRequest("POST", body), noContext);
const update = (id: string, body: unknown) =>
  itemRoute.PATCH(jsonRequest("PATCH", body), { params: Promise.resolve({ id }) });

describe("items API", () => {
  beforeEach(async () => {
    cookieJar.clear();
    await resetDatabase();
  });
  afterAll(() => prisma.$disconnect());

  describe("signed out (FR-01)", () => {
    it("rejects every operation", async () => {
      const item = await createTestItem("CAM-1");

      expect((await list()).status).toBe(401);
      expect((await show(item.id)).status).toBe(401);
      expect((await create(validItem)).status).toBe(401);
      expect((await update(item.id, { name: "x" })).status).toBe(401);
    });
  });

  describe.each([Role.Borrower, Role.Staff])("as %s (FR-02, FR-05)", (role) => {
    it("can browse and view items", async () => {
      const item = await createTestItem("CAM-1");
      await logInAs(role);

      const response = await list();
      expect(response.status).toBe(200);
      expect((await response.json()).items).toHaveLength(1);
      expect((await show(item.id)).status).toBe(200);
    });

    it("cannot create an item", async () => {
      await logInAs(role);

      expect((await create(validItem)).status).toBe(403);
      await expect(prisma.item.count()).resolves.toBe(0);
    });

    it("cannot update an item", async () => {
      const item = await createTestItem("CAM-1", { name: "Original" });
      await logInAs(role);

      expect((await update(item.id, { name: "Hacked" })).status).toBe(403);
      await expect(prisma.item.findUnique({ where: { id: item.id } })).resolves.toMatchObject({
        name: "Original",
      });
    });
  });

  describe("condition notes", () => {
    it("are left out of a borrower's responses (FR-07)", async () => {
      const item = await createTestItem("CAM-1", { conditionNotes: "Internal note" });
      await logInAs(Role.Borrower);

      expect(await (await list()).text()).not.toContain("Internal note");
      expect(await (await show(item.id)).text()).not.toContain("Internal note");
    });

    it("are included for staff", async () => {
      const item = await createTestItem("CAM-1", { conditionNotes: "Internal note" });
      await logInAs(Role.Staff);

      expect((await (await show(item.id)).json()).item.conditionNotes).toBe("Internal note");
    });
  });

  describe("as administrator", () => {
    beforeEach(() => logInAs(Role.Administrator));

    it("creates an item (FR-05)", async () => {
      const response = await create(validItem);

      expect(response.status).toBe(201);
      expect((await response.json()).item).toMatchObject({
        itemCode: "CAM-9",
        status: ItemStatus.Available,
      });
    });

    it("explains a duplicate item ID on the field (FR-06)", async () => {
      await createTestItem("CAM-9");
      const response = await create({ ...validItem, itemCode: "cam-9" });

      expect(response.status).toBe(409);
      expect((await response.json()).error.fields.itemCode).toHaveLength(1);
    });

    it("returns field errors for invalid input (NFR-02)", async () => {
      const response = await create({ itemCode: "bad code", name: "", description: "" });
      const { error } = await response.json();

      expect(response.status).toBe(400);
      expect(Object.keys(error.fields).sort()).toEqual([
        "category",
        "description",
        "itemCode",
        "name",
      ]);
    });

    it("updates an item", async () => {
      const item = await createTestItem("CAM-1");
      const response = await update(item.id, { name: "Renamed" });

      expect(response.status).toBe(200);
      expect((await response.json()).item.name).toBe("Renamed");
    });

    it("refuses to clear an Unavailable item through an edit (FR-21)", async () => {
      const item = await createTestItem("CAM-1", { status: ItemStatus.Unavailable });
      const response = await update(item.id, { status: ItemStatus.Available });

      expect(response.status).toBe(409);
    });

    it("refuses to set Held through the API (INV-02)", async () => {
      const item = await createTestItem("CAM-1");
      const response = await update(item.id, { status: ItemStatus.Held });

      expect(response.status).toBe(400);
      await expect(prisma.item.findUnique({ where: { id: item.id } })).resolves.toMatchObject({
        status: ItemStatus.Available,
      });
    });

    it("returns 404 for an unknown item", async () => {
      expect((await show("missing")).status).toBe(404);
      expect((await update("missing", { name: "x" })).status).toBe(404);
    });
  });

  it("offers no way to delete an item (FR-06)", () => {
    expect(itemRoute).not.toHaveProperty("DELETE");
    expect(itemsRoute).not.toHaveProperty("DELETE");
  });
});
