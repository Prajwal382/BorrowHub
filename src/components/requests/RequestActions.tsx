"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CheckoutForm } from "@/components/loans/CheckoutForm";
import { TextField } from "@/components/forms/TextField";
import { useHydrated } from "@/components/forms/useHydrated";
import { RequestStatus } from "@/generated/prisma/enums";
import { sendJson } from "@/lib/api/client";
import type { FieldErrors } from "@/lib/errors";

type RequestActionsProps = {
  requestId: string;
  status: RequestStatus;
  itemAvailable: boolean;
  today: string;
  defaultDueDate: string;
};

const primaryButton =
  "rounded-md bg-foreground px-3 py-1.5 font-medium text-background disabled:opacity-60";
const secondaryButton = "rounded-md border border-foreground/50 px-3 py-1.5 disabled:opacity-60";

export function RequestActions({
  requestId,
  status,
  itemAvailable,
  today,
  defaultDueDate,
}: RequestActionsProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [mode, setMode] = useState<"idle" | "rejecting" | "confirmingCancel" | "checkingOut">(
    "idle",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [fields, setFields] = useState<FieldErrors>();

  async function send(action: "approve" | "reject" | "cancel-hold", body?: unknown) {
    setBusy(true);
    setMessage(undefined);
    setFields(undefined);
    const result = await sendJson(`/api/requests/${requestId}/${action}`, "POST", body);
    setBusy(false);

    if (result.ok) {
      setMode("idle");
    } else {
      setMessage(result.message);
      setFields(result.fields);
    }
    // A failure usually means someone else got there first, so refresh to show what changed.
    router.refresh();
  }

  function handleReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send("reject", Object.fromEntries(new FormData(event.currentTarget)));
  }

  const disabled = !hydrated || busy;

  return (
    <div className="flex flex-col gap-2">
      {message && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {message}
        </p>
      )}

      {status === RequestStatus.Pending && mode !== "rejecting" && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={disabled || !itemAvailable}
              onClick={() => send("approve")}
            >
              Approve
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={disabled}
              onClick={() => setMode("rejecting")}
            >
              Reject
            </button>
          </div>
          {/* FR-13 */}
          {!itemAvailable && (
            <p className="text-sm">
              This request stays pending. It cannot be approved until the item is available.
            </p>
          )}
        </>
      )}

      {status === RequestStatus.Pending && mode === "rejecting" && (
        <form method="post" onSubmit={handleReject} noValidate className="flex flex-col gap-2">
          <TextField
            name="reason"
            label="Reason for rejection"
            multiline
            hint="The borrower will see this."
            errors={fields?.reason}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryButton} disabled={disabled}>
              Confirm rejection
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => {
                setMode("idle");
                setFields(undefined);
              }}
            >
              Keep pending
            </button>
          </div>
        </form>
      )}

      {status === RequestStatus.Approved && mode === "checkingOut" && (
        <CheckoutForm
          requestId={requestId}
          today={today}
          defaultDueDate={defaultDueDate}
          onCancel={() => setMode("idle")}
        />
      )}

      {status === RequestStatus.Approved &&
        mode !== "checkingOut" &&
        (mode === "confirmingCancel" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>Cancel this hold and release the item?</span>
            <button
              type="button"
              className={primaryButton}
              disabled={disabled}
              onClick={() => send("cancel-hold")}
            >
              Yes, cancel hold
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => setMode("idle")}
            >
              Keep hold
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={disabled}
              onClick={() => setMode("checkingOut")}
            >
              Check out
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={disabled}
              onClick={() => setMode("confirmingCancel")}
            >
              Cancel hold
            </button>
          </div>
        ))}
    </div>
  );
}
