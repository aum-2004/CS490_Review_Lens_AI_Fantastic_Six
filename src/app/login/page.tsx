import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import Loading from "@/app/login/loading";
import { AuthForm } from "@/components/auth/AuthForm";
import { SessionPanel } from "@/components/auth/SessionPanel";
import { Card } from "@/components/ui/Card";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import type { AuthIdentity } from "@/lib/validation/auth";
import { getProtectedReturnTo } from "@/lib/validation/return-to";
import { redirect } from "next/navigation";

type LoginPageProps = { searchParams: Promise<{ notice?: string; next?: string | string[] }> };

export default function LoginPage(props: LoginPageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <AccountPage {...props} />
    </Suspense>
  );
}

async function AccountPage({ searchParams }: LoginPageProps) {
  // Explicit request boundary also prevents safe error handling from masking
  // a prerender bailout when configuration is absent.
  await connection();
  const { notice, next } = await searchParams;
  const returnTo = getProtectedReturnTo(next);
  let user: AuthIdentity | null = null;
  let unavailable = false;
  try {
    user = await getAuthenticatedUser();
  } catch {
    unavailable = true;
  }
  // redirect throws; keep it outside the provider-error catch.
  if (user && returnTo) redirect(returnTo);

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-16 text-foreground">
      <div className="w-full max-w-xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">ReviewLens AI</h1>
          <p className="mt-2 text-muted-foreground">
            {user ? "Your account" : "Please sign in to continue."}
          </p>
        </div>
        <Card>
          {unavailable ? (
            <p role="alert">Authentication is temporarily unavailable. Please try again later.</p>
          ) : user ? (
            <SessionPanel email={user.email} />
          ) : (
            <>
              {notice === "confirmation-error" && (
                <p role="alert" className="mb-6 text-sm text-destructive">
                  We couldn’t confirm your email. The link may have expired or already been used.
                  Try signing in, or request a new confirmation email from your team administrator.
                </p>
              )}
              <AuthForm returnTo={returnTo} />
            </>
          )}
        </Card>
        <Link
          href="/"
          className="text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
