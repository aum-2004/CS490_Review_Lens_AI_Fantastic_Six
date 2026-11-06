"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/shared/Spinner";

export function SessionPanel({ email }: { email: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setPending(true);
    setError(null);
    try {
      const result = await signOut();
      if (result.success) {
        router.replace("/login");
        router.refresh();
      } else setError(result.message ?? "We couldn't sign you out. Please try again.");
    } catch {
      setError("We couldn't sign you out. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p role="status">You’re signed in{email ? ` as ${email}` : ""}.</p>
      <p className="text-sm text-muted-foreground">
        Your ReviewLens session is active. You can return to this page after navigating or
        refreshing.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" variant="outline" disabled={pending} onClick={logout}>
        {pending && <Spinner />}
        {pending ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
