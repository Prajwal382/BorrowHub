import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDateOnly,
  formatDateTime,
  orgToday,
  ORG_TIME_ZONE,
  parseDateOnly,
  toDateOnlyString,
} from "@/lib/dates";

describe("organization time zone (SRS 2.2)", () => {
  it("uses the configured zone", () => {
    expect(ORG_TIME_ZONE).toBe("America/Chicago");
  });

  it.each([
    // Still the previous day in Chicago, though already the next day in UTC.
    ["2026-11-10T05:59:59Z", "2026-11-09"],
    ["2026-11-10T06:00:00Z", "2026-11-10"],
    // Daylight saving time moves the boundary by an hour.
    ["2026-07-10T04:59:59Z", "2026-07-09"],
    ["2026-07-10T05:00:00Z", "2026-07-10"],
  ])("treats %s as %s", (now, expected) => {
    expect(toDateOnlyString(orgToday(new Date(now)))).toBe(expected);
  });

  it("formats timestamps in the organization's zone", () => {
    expect(formatDateTime(new Date("2026-11-10T05:30:00Z"))).toContain("Nov 9, 2026");
  });
});

describe("date-only values", () => {
  it("parses a real date to midnight UTC", () => {
    expect(parseDateOnly("2026-11-09")?.toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  it.each(["2026-02-30", "2026-13-01", "11/09/2026", "2026-1-1", "", "tomorrow"])(
    "rejects %j",
    (value) => {
      expect(parseDateOnly(value)).toBeNull();
    },
  );

  it("displays the stored day, whatever the time zone", () => {
    expect(formatDateOnly(new Date("2026-11-09T00:00:00Z"))).toBe("Nov 9, 2026");
  });

  it("adds days", () => {
    expect(toDateOnlyString(addDays(new Date("2026-12-31T00:00:00Z"), 1))).toBe("2027-01-01");
  });
});
