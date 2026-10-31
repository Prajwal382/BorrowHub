// SRS 2.2: dates are evaluated in one configured organization time zone. Formatting with it
// here also fails at startup if ORG_TIME_ZONE is not a real time zone.
export const ORG_TIME_ZONE = process.env.ORG_TIME_ZONE || "America/Chicago";

const orgDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: ORG_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const orgDateTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ORG_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

// Date-only columns hold midnight UTC, so they must be displayed in UTC to keep their day.
const dateOnlyFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  dateStyle: "medium",
});

// Dates without a time are represented as midnight UTC, matching Prisma's @db.Date columns.
export function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  // Rejects dates that do not exist, such as 2026-02-30.
  return !Number.isNaN(date.getTime()) && toDateOnlyString(date) === value ? date : null;
}

export function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

// The current calendar date in the organization, as a date-only value.
export function orgToday(now: Date = new Date()) {
  return new Date(`${orgDateFormat.format(now)}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function formatDateOnly(date: Date) {
  return dateOnlyFormat.format(date);
}

export function formatDateTime(date: Date) {
  return orgDateTimeFormat.format(date);
}
