import { vi } from "vitest";
import { cookieJar } from "./cookie-jar";

vi.mock("next/headers", () => ({
  cookies: async () => cookieJar,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
