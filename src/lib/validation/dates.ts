import { z } from "zod";
import { parseDateOnly } from "@/lib/dates";

// NFR-02: accepts only real calendar dates. Rules that need the clock live in the services.
export function dateOnlySchema(missing: string, invalid: string) {
  return z.string(missing).transform((value, context) => {
    const date = parseDateOnly(value);
    if (!date) {
      context.addIssue({ code: "custom", message: value === "" ? missing : invalid });
      return z.NEVER;
    }
    return date;
  });
}
