"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { showNotice } from "@/components/feedback/notices";
import { FormAlert, RequiredNote } from "@/components/forms/FormAlert";
import { TextField } from "@/components/forms/TextField";
import { formValues, useFormSubmit } from "@/components/forms/useFormSubmit";
import { CheckoutForm } from "@/components/loans/CheckoutForm";
import { RequestStatus } from "@/generated/prisma/enums";

type RequestActionsProps = {
  requestId: string;
  itemName: string;
  borrowerName: string;
  status: RequestStatus;
  itemAvailable: boolean;
  today: string;
  defaultDueDate: string;
};

type Mode = "idle" | "rejecting" | "confirmingCancel" | "checkingOut";

export function RequestActions({
  requestId,
  itemName,
  borrowerName,
  status,
  itemAvailable,
  today,
  defaultDueDate,
}: RequestActionsProps) {
  const router = useRouter();
  const { formRef, message, fields, disabled, submitting, submit, clearErrors } = useFormSubmit({
    conflictsAsNotice: true,
  });
  const [mode, setMode] = useState<Mode>("idle");
  const containerRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const questionId = useId();

  // NFR-04: each change of mode removes the button that was just pressed, which would otherwise
  // drop keyboard users back at the top of the page.
  useEffect(() => {
    if (moveFocus.current) {
      moveFocus.current = false;
      const container = containerRef.current;
      const target =
        container?.querySelector<HTMLElement>("[data-initial-focus]") ??
        container?.querySelector<HTMLElement>("input, textarea, button:not(:disabled)");
      target?.focus();
    }
  }, [mode]);

  function changeMode(next: Mode) {
    moveFocus.current = true;
    setMode(next);
    clearErrors();
  }

  async function send(
    action: "approve" | "reject" | "cancel-hold",
    success: string,
    body?: unknown,
  ) {
    const result = await submit(`/api/requests/${requestId}/${action}`, "POST", body);
    if (result.ok) {
      setMode("idle");
      showNotice(success);
    }
    // A failure usually means someone else got there first, so refresh to show what changed.
    router.refresh();
  }

  function handleReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(
      "reject",
      `Rejected the request for ${itemName}. ${borrowerName} can see your reason.`,
      formValues(event.currentTarget),
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <FormAlert message={message} />

      {status === RequestStatus.Pending && mode !== "rejecting" && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="button-primary"
              disabled={disabled || !itemAvailable}
              onClick={() =>
                send("approve", `Approved. ${itemName} is now on hold for ${borrowerName}.`)
              }
            >
              {submitting ? "Approving…" : "Approve"}
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={disabled}
              onClick={() => changeMode("rejecting")}
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
        <form
          ref={formRef}
          method="post"
          onSubmit={handleReject}
          noValidate
          className="flex flex-col gap-2"
        >
          <RequiredNote />
          <TextField
            name="reason"
            label="Reason for rejection"
            multiline
            hint="The borrower will see this."
            errors={fields?.reason}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="button-primary" disabled={disabled}>
              {submitting ? "Rejecting…" : "Confirm rejection"}
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={submitting}
              onClick={() => changeMode("idle")}
            >
              Keep pending
            </button>
          </div>
        </form>
      )}

      {status === RequestStatus.Approved && mode === "checkingOut" && (
        <CheckoutForm
          requestId={requestId}
          itemName={itemName}
          borrowerName={borrowerName}
          today={today}
          defaultDueDate={defaultDueDate}
          onCancel={() => changeMode("idle")}
        />
      )}

      {status === RequestStatus.Approved &&
        mode !== "checkingOut" &&
        (mode === "confirmingCancel" ? (
          <div
            role="group"
            aria-labelledby={questionId}
            className="flex flex-wrap items-center gap-2"
          >
            <span id={questionId}>Cancel this hold and release the item?</span>
            <button
              type="button"
              className="button-primary"
              disabled={disabled}
              onClick={() =>
                send("cancel-hold", `Hold cancelled. ${itemName} is available to request again.`)
              }
            >
              {submitting ? "Cancelling…" : "Yes, cancel hold"}
            </button>
            {/* Starts on the safe choice, so a second press of Enter cannot cancel by accident. */}
            <button
              type="button"
              data-initial-focus
              className="button-secondary"
              disabled={submitting}
              onClick={() => changeMode("idle")}
            >
              Keep hold
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="button-primary"
              disabled={disabled}
              onClick={() => changeMode("checkingOut")}
            >
              Check out
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={disabled}
              onClick={() => changeMode("confirmingCancel")}
            >
              Cancel hold
            </button>
          </div>
        ))}
    </div>
  );
}
