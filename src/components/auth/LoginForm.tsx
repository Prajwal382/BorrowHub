"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TextField } from "@/components/forms/TextField";
import { useHydrated } from "@/components/forms/useHydrated";
import { sendJson } from "@/lib/api/client";
import { safeNextPath } from "@/lib/auth/redirects";
import type { FieldErrors } from "@/lib/errors";

export function LoginForm() {
  const searchParams = useSearchParams();
  const hydrated = useHydrated();
  const [message, setMessage] = useState<string>();
  const [fields, setFields] = useState<FieldErrors>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(undefined);
    setFields(undefined);

    const result = await sendJson(
      "/api/auth/login",
      "POST",
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (result.ok) {
      // A full page load, because Next.js keeps visited pages alive but hidden. This clears
      // the typed password and any content belonging to the previous session.
      window.location.assign(safeNextPath(searchParams.get("next")));
      return;
    }

    setMessage(result.message);
    setFields(result.fields);
    setSubmitting(false);
  }

  return (
    // NFR-01: until hydration the browser would submit natively, so the button stays disabled
    // (which also blocks pressing Enter) and POST keeps credentials out of the URL regardless.
    <form method="post" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {message && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {message}
        </p>
      )}
      <TextField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        errors={fields?.email}
      />
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        errors={fields?.password}
      />
      <button
        type="submit"
        disabled={!hydrated || submitting}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-60"
      >
        {submitting ? "Logging in…" : "Log in"}
      </button>
      <p>
        New here?{" "}
        <Link href="/register" className="underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
