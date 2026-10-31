type TextFieldProps = {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  hint?: string;
  errors?: string[];
};

// NFR-04: every input has a label, is marked required, and is linked to its error text.
export function TextField({
  name,
  label,
  type = "text",
  autoComplete,
  hint,
  errors,
}: TextFieldProps) {
  const inputId = `field-${name}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const hasError = Boolean(errors?.length);
  const describedBy = [hint && hintId, hasError && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="font-medium">
        {label} <span aria-hidden="true">*</span>
      </label>
      <input
        id={inputId}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        aria-invalid={hasError}
        aria-describedby={describedBy}
        className="rounded-md border border-foreground/40 bg-background px-3 py-2 aria-invalid:border-red-600"
      />
      {hint && (
        <p id={hintId} className="text-sm opacity-80">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={errorId} className="text-sm text-red-700 dark:text-red-400">
          {errors?.join(" ")}
        </p>
      )}
    </div>
  );
}
