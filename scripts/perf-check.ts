// NFR-05: times catalog search and dashboard views for 500 items and 50 simultaneous users against
// the 3-second target. It uses only the test database, which it erases, never the development one.
import "dotenv/config";
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";

const TARGET_MS = 3000;
const ITEM_COUNT = 500;
const USER_COUNT = 50;
const ROUNDS = 3;
const PAGE_PORT = 3199;
const PASSWORD = "perf-check-password";

const ACTIVE_LOANS = 100;
const OVERDUE_LOANS = 25;
const HOLDS = 20;
const PENDING_REQUESTS = 100;
const CLOSED_LOANS = 1000;

type Measurement = { label: string; median: number; p95: number; max: number; failures: number };

const percentile = (sorted: number[], fraction: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];

// Every user starts together, so each time includes waiting for the others' database connections.
async function measure(label: string, work: (user: number) => Promise<boolean | void>) {
  const times: number[] = [];
  let failures = 0;

  for (let round = 0; round < ROUNDS; round++) {
    await Promise.all(
      Array.from({ length: USER_COUNT }, async (_, user) => {
        const start = performance.now();
        try {
          if ((await work(user)) === false) {
            failures++;
          }
        } catch {
          failures++;
        }
        times.push(performance.now() - start);
      }),
    );
  }

  times.sort((a, b) => a - b);
  return {
    label,
    median: percentile(times, 0.5),
    p95: percentile(times, 0.95),
    max: times[times.length - 1],
    failures,
  } satisfies Measurement;
}

function printResults(title: string, results: Measurement[]) {
  console.log(`\n${title}`);
  console.log(
    `${"".padEnd(36)}${"median".padStart(9)}${"p95".padStart(9)}${"slowest".padStart(9)}`,
  );
  for (const { label, median, p95, max, failures } of results) {
    const ok = max <= TARGET_MS && failures === 0;
    const times = [median, p95, max].map((ms) => `${Math.round(ms)}ms`.padStart(9)).join("");
    const note = failures ? `  ${failures} failed` : "";
    console.log(`${label.padEnd(36)}${times}  ${ok ? "PASS" : "FAIL"}${note}`);
  }
}

async function seed() {
  const { ItemStatus, LoanStatus, RequestStatus, Role } =
    await import("../src/generated/prisma/client");
  const { addDays, orgToday } = await import("../src/lib/dates");
  const { prisma } = await import("../src/lib/db");
  const { hashPassword } = await import("../src/lib/services/authService");

  const today = orgToday();
  const passwordHash = await hashPassword(PASSWORD);
  const categories = ["Cameras", "Laptops", "Audio", "Projectors", "Tablets", "Lighting"];
  const borrowerId = (index: number) => `perf-borrower-${index % USER_COUNT}`;
  const itemId = (index: number) => `perf-item-${index}`;

  await prisma.user.createMany({
    data: [
      {
        id: "perf-staff",
        email: "perf-staff@test.local",
        name: "Perf Staff",
        passwordHash,
        role: Role.Staff,
      },
      ...Array.from({ length: USER_COUNT }, (_, index) => ({
        id: borrowerId(index),
        email: `perf-borrower-${index}@test.local`,
        name: `Perf Borrower ${index}`,
        passwordHash,
      })),
    ],
  });

  const holdsEnd = ACTIVE_LOANS + HOLDS;
  await prisma.item.createMany({
    data: Array.from({ length: ITEM_COUNT }, (_, index) => {
      const category = categories[index % categories.length];
      return {
        id: itemId(index),
        itemCode: `PERF-${String(index).padStart(4, "0")}`,
        name: `${category.slice(0, -1)} model ${index}`,
        description: `A ${category.toLowerCase()} unit kept for lending, with its usual accessories.`,
        category,
        conditionNotes: "Good.",
        status:
          index < ACTIVE_LOANS
            ? ItemStatus.CheckedOut
            : index < holdsEnd
              ? ItemStatus.Held
              : ItemStatus.Available,
      };
    }),
  });

  const fulfilled = (id: string, index: number, item: number, dayOffset: number) => ({
    id,
    borrowerId: borrowerId(index),
    itemId: itemId(item),
    intendedUse: "Performance check",
    requestedReturnDate: addDays(today, dayOffset + 7),
    status: RequestStatus.Fulfilled,
    decidedById: "perf-staff",
    decidedAt: addDays(today, dayOffset),
  });

  const closedItem = (index: number) => holdsEnd + PENDING_REQUESTS + (index % 200);
  await prisma.request.createMany({
    data: [
      ...Array.from({ length: ACTIVE_LOANS }, (_, index) =>
        fulfilled(`perf-active-${index}`, index, index, index < OVERDUE_LOANS ? -14 : -2),
      ),
      ...Array.from({ length: HOLDS }, (_, index) => ({
        id: `perf-hold-${index}`,
        borrowerId: borrowerId(index),
        itemId: itemId(ACTIVE_LOANS + index),
        intendedUse: "Performance check",
        requestedReturnDate: addDays(today, 7),
        status: RequestStatus.Approved,
        decidedById: "perf-staff",
        decidedAt: today,
      })),
      ...Array.from({ length: PENDING_REQUESTS }, (_, index) => ({
        borrowerId: borrowerId(index),
        itemId: itemId(holdsEnd + index),
        intendedUse: "Performance check",
        requestedReturnDate: addDays(today, 7),
      })),
      ...Array.from({ length: CLOSED_LOANS }, (_, index) =>
        fulfilled(`perf-closed-${index}`, index, closedItem(index), -30),
      ),
    ],
  });

  await prisma.loan.createMany({
    data: [
      ...Array.from({ length: ACTIVE_LOANS }, (_, index) => ({
        requestId: `perf-active-${index}`,
        borrowerId: borrowerId(index),
        itemId: itemId(index),
        checkoutDate: addDays(today, index < OVERDUE_LOANS ? -14 : -2),
        agreedDueDate: addDays(today, index < OVERDUE_LOANS ? -4 : 7),
        checkoutCondition: "Good.",
        checkedOutById: "perf-staff",
      })),
      ...Array.from({ length: CLOSED_LOANS }, (_, index) => ({
        requestId: `perf-closed-${index}`,
        borrowerId: borrowerId(index),
        itemId: itemId(closedItem(index)),
        status: LoanStatus.Closed,
        checkoutDate: addDays(today, -30),
        agreedDueDate: addDays(today, -23),
        checkoutCondition: "Good.",
        checkedOutById: "perf-staff",
        returnDate: addDays(today, -24),
        returnCondition: "Good.",
        returnedById: "perf-staff",
        returnedAt: addDays(today, -24),
      })),
    ],
  });
}

async function measureQueries() {
  const { LoanStatus, RequestStatus, Role } = await import("../src/generated/prisma/client");
  const { listCategories, searchItems } = await import("../src/lib/services/itemService");
  const { listLoans } = await import("../src/lib/services/loanService");
  const { listRequests } = await import("../src/lib/services/requestService");

  const staff = { id: "perf-staff", role: Role.Staff };
  const borrower = (user: number) => ({ id: `perf-borrower-${user}`, role: Role.Borrower });

  return [
    await measure("Catalog search by word", () =>
      Promise.all([searchItems({ q: "camera", page: 1 }, Role.Borrower), listCategories()]).then(
        () => {},
      ),
    ),
    await measure("Catalog, no filter, last page", () =>
      Promise.all([searchItems({ page: 25 }, Role.Borrower), listCategories()]).then(() => {}),
    ),
    await measure("Borrower dashboard", (user) =>
      Promise.all([
        listRequests(borrower(user), { page: 1 }),
        listLoans(borrower(user), { status: LoanStatus.Active, page: 1 }),
      ]).then(() => {}),
    ),
    await measure("Staff dashboard", () =>
      Promise.all([
        listRequests(staff, { status: RequestStatus.Pending, page: 1 }),
        listLoans(staff, { status: LoanStatus.Active, page: 1 }),
        listLoans(staff, { overdue: true, page: 1 }),
      ]).then(() => {}),
    ),
  ];
}

async function waitForServer(base: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await fetch(`${base}/login`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("The production server did not start within 30 seconds.");
}

async function logIn(base: string, email: string) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`Could not log in as ${email}: ${response.status}`);
  }
  return response.headers.getSetCookie()[0].split(";")[0];
}

// The full view people wait for: routing, session, database reads, rendering, and streaming.
async function measurePages(testUrl: string) {
  const base = `http://localhost:${PAGE_PORT}`;
  const inUse = await fetch(`${base}/login`).then(
    () => true,
    () => false,
  );
  if (inUse) {
    throw new Error(`Port ${PAGE_PORT} is already in use. Stop whatever is using it and retry.`);
  }

  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(PAGE_PORT)],
    { env: { ...process.env, DATABASE_URL: testUrl }, stdio: "ignore" },
  );

  try {
    await waitForServer(base);
    const staffCookie = await logIn(base, "perf-staff@test.local");
    const cookies: string[] = [];
    for (let user = 0; user < USER_COUNT; user++) {
      cookies.push(await logIn(base, `perf-borrower-${user}@test.local`));
    }

    const load = async (path: string, cookie: string, expected: string) => {
      const response = await fetch(`${base}${path}`, {
        headers: { cookie },
        redirect: "manual",
      });
      // A failure can arrive inside a streamed 200, so the content itself has to be checked.
      return response.status === 200 && (await response.text()).includes(expected);
    };

    return [
      await measure("Catalog search page", (user) =>
        load("/catalog?q=camera", cookies[user], "Camera model"),
      ),
      await measure("Borrower dashboard page", (user) =>
        load("/dashboard", cookies[user], "My active loans"),
      ),
      await measure("Staff dashboard page", () => load("/dashboard", staffCookie, "Overdue loans")),
    ];
  } finally {
    server.kill();
  }
}

async function main() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl || !new URL(testUrl).pathname.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL must name a database ending in _test. See .env.example.");
  }
  // Set before anything imports the database client, which reads this once.
  process.env.DATABASE_URL = testUrl;
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: process.env });

  const { prisma } = await import("../src/lib/db");
  const eraseTestData = () =>
    prisma.$executeRaw`TRUNCATE "AuditLog", "Loan", "Request", "Item", "User" CASCADE`;

  try {
    await eraseTestData();
    await seed();
    console.log(
      `Seeded ${ITEM_COUNT} items, ${USER_COUNT + 1} users, ${ACTIVE_LOANS} active loans ` +
        `(${OVERDUE_LOANS} overdue), ${HOLDS} holds, ${PENDING_REQUESTS} pending requests, ` +
        `and ${CLOSED_LOANS} completed loans.`,
    );
    console.log(
      `Each row: ${USER_COUNT} simultaneous users, ${ROUNDS} rounds. Target: ${TARGET_MS}ms.`,
    );

    const queries = await measureQueries();
    printResults("Database queries", queries);

    let pages: Measurement[] = [];
    if (existsSync(".next/BUILD_ID")) {
      pages = await measurePages(testUrl);
      printResults("Full pages from the production build", pages);
    } else {
      console.log("\nFull pages: SKIPPED. Run npm run build first to measure them.");
    }

    const passed = [...queries, ...pages].every(
      ({ max, failures }) => max <= TARGET_MS && failures === 0,
    );
    console.log(`\nNFR-05: ${passed ? "PASS" : "FAIL"}`);
    process.exitCode = passed ? 0 : 1;
  } finally {
    await eraseTestData();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
