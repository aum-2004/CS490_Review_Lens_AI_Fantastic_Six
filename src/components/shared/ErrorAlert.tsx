/** Pass safe, user-facing copy; never a provider error or diagnostic object. */
export function ErrorAlert({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
