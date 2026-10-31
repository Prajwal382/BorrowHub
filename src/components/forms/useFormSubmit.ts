"use client";

import { useEffect, useRef, useState } from "react";
import { showNotice } from "@/components/feedback/notices";
import { useHydrated } from "@/components/forms/useHydrated";
import { sendJson } from "@/lib/api/client";
import type { FieldErrors } from "@/lib/errors";

type FormSubmitOptions = {
  // For forms a refresh can remove: if someone else got there first, the form disappears, so its
  // own error message would disappear with it.
  conflictsAsNotice?: boolean;
  // For forms followed by a full page load, which must not be resubmitted in the meantime.
  stayBusyOnSuccess?: boolean;
};

export function formValues(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form));
}

export function useFormSubmit({ conflictsAsNotice, stayBusyOnSuccess }: FormSubmitOptions = {}) {
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string>();
  const [fields, setFields] = useState<FieldErrors>();
  const [submitting, setSubmitting] = useState(false);

  // NFR-04: takes keyboard and screen reader users straight to the first problem.
  useEffect(() => {
    if (fields) {
      const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      // A radio group cannot take focus itself, so its first option does.
      (invalid?.querySelector<HTMLElement>("input") ?? invalid)?.focus();
    }
  }, [fields]);

  function clearErrors() {
    setMessage(undefined);
    setFields(undefined);
  }

  async function submit<Data = unknown>(url: string, method: "POST" | "PATCH", body?: unknown) {
    setSubmitting(true);
    clearErrors();

    const result = await sendJson<Data>(url, method, body);
    if (!result.ok || !stayBusyOnSuccess) {
      setSubmitting(false);
    }
    if (!result.ok) {
      if (conflictsAsNotice && !result.fields) {
        showNotice(result.message, { tone: "error" });
      } else {
        setMessage(result.message);
      }
      setFields(result.fields);
    }
    return result;
  }

  return {
    formRef,
    message,
    fields,
    submitting,
    disabled: !hydrated || submitting,
    submit,
    clearErrors,
  };
}
