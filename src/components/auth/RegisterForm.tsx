"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { FormAlert, RequiredNote } from "@/components/forms/FormAlert";
import { TextField } from "@/components/forms/TextField";
import { formValues, useFormSubmit } from "@/components/forms/useFormSubmit";

export function RegisterForm() {
  const { formRef, message, fields, submitting, disabled, submit } = useFormSubmit({
    stayBusyOnSuccess: true,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await submit("/api/auth/register", "POST", formValues(event.currentTarget));
    if (result.ok) {
      // A full page load clears the typed password; see LoginForm.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard");
    }
  }

  return (
    // NFR-01: keeps the password out of the URL if submitted before hydration; see LoginForm.
    <form
      ref={formRef}
      method="post"
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4"
    >
      <FormAlert message={message} />
      <RequiredNote />
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
      <button type="submit" disabled={disabled} className="button-primary">
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
