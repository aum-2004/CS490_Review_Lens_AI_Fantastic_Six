"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/Button";
import { Spinner } from "./Spinner";

export function AccountMenu({ email }: { email: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await signOut();
      if (!result.success) {
        setError("We couldn't sign you out. Please try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("We couldn't sign you out. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-w-0">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="outline" disabled={pending} className="max-w-full">
            {pending && <Spinner />}
            <span className="truncate">{pending ? "Signing out…" : (email ?? "Account")}</span>
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="z-50 min-w-40 rounded-md border border-border bg-card p-1 text-card-foreground shadow-sm"
          >
            <DropdownMenu.Item
              disabled={pending}
              onSelect={() => void logout()}
              className="cursor-pointer rounded-sm px-3 py-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
            >
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
