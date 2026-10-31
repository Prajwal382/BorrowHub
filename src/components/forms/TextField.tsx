import { useId } from "react";

type TextFieldProps = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "date";
  min?: string;
  max?: string;
  autoComplete?: string;
  hint?: string;
  errors?: string[];
  required?: boolean;
  defaultValue?: string;
  multiline?: boolean;
  suggestions?: string[];
};

// NFR-04: every input has a label, marks whether it is required, and links to its error text.
export function TextField({
  name,
  label,
  type = "text",
  min,
  max,
  autoComplete,
  hint,
  errors,
  required = true,
  defaultValue,
  multiline = false,
  suggestions,
}: TextFieldProps) {
  // Next.js keeps visited pages in the DOM, so fixed IDs would clash across pages.
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const listId = `${inputId}-suggestions`;
  const hasError = Boolean(errors?.length);
  const describedBy = [hint && hintId, hasError && errorId].filter(Boolean).join(" ") || undefined;
  const shared = {
    id: inputId,
    name,
    required,
    defaultValue,
    "aria-invalid": hasError,
    "aria-describedby": describedBy,
    className: "form-input",
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="font-medium">
        {label} {required ? <span aria-hidden="true">*</span> : "(optional)"}
      </label>
      {multiline ? (
        <textarea {...shared} rows={4} />
      ) : (
        <input
          {...shared}
          type={type}
          min={min}
          max={max}
          autoComplete={autoComplete}
          list={suggestions ? listId : undefined}
        />
      )}
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
      {hint && (
        <p id={hintId} className="text-sm opacity-80">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={errorId} className="error-text text-sm">
          {errors?.join(" ")}
        </p>
      )}
    </div>
  );
}
