"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { TextField } from "@/components/forms/TextField";
import { useHydrated } from "@/components/forms/useHydrated";
import { sendJson } from "@/lib/api/client";
import type { FieldErrors } from "@/lib/errors";

export function RegisterForm() {
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
      "/api/auth/register",
      "POST",
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (result.ok) {
      // A full page load clears the typed password; see LoginForm.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard");
      return;
    }

    setMessage(result.message);
    setFields(result.fields);
    setSubmitting(false);
  }

  return (
    // NFR-01: keeps the password out of the URL if submitted before hydration; see LoginForm.
    <form method="post" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {message && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {message}
        </p>
      )}
      <TextField name="name" label="Name" autoComplete="name" errors={fields?.name} />
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
        autoComplete="new-password"
        hint="At least 8 characters."
        errors={fields?.password}
      />
      <button
        type="submit"
        disabled={!hydrated || submitting}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-60"
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>
      <p>
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
