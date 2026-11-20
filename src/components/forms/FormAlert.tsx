export function FormAlert({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="alert-error">
      {message}
    </p>
  );
}

// NFR-04: explains the mark that TextField puts on required fields.
export function RequiredNote() {
  return <p className="text-sm text-muted">Fields marked * are required.</p>;
}
