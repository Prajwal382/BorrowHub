"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { FormAlert, RequiredNote } from "@/components/forms/FormAlert";
import { TextField } from "@/components/forms/TextField";
import { formValues, useFormSubmit } from "@/components/forms/useFormSubmit";
import { safeNextPath } from "@/lib/auth/redirects";

export function LoginForm() {
  const searchParams = useSearchParams();
  const { formRef, message, fields, submitting, disabled, submit } = useFormSubmit({
    stayBusyOnSuccess: true,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await submit("/api/auth/login", "POST", formValues(event.currentTarget));
    if (result.ok) {
      // A full page load, because Next.js keeps visited pages alive but hidden. This clears
      // the typed password and any content belonging to the previous session.
      window.location.assign(safeNextPath(searchParams.get("next")));
    }
  }

  return (
    // NFR-01: until hydration the browser would submit natively, so the button stays disabled
    // (which also blocks pressing Enter) and POST keeps credentials out of the URL regardless.
    <form
      ref={formRef}
      method="post"
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4"
    >
      <FormAlert message={message} />
      <RequiredNote />
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
      <button type="submit" disabled={disabled} className="button-primary">
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
