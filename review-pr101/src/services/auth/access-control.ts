import "server-only";

import { redirect } from "next/navigation";
import { connection, NextResponse } from "next/server";
import { getProtectedReturnTo } from "@/lib/validation/return-to";
import type { AuthIdentity } from "@/lib/validation/auth";
import { getAuthenticatedUser } from "@/services/auth/auth-service";

// Call inside the protected page/data operation, behind Suspense. A layout
// check alone cannot protect independently rendered children or Server Actions.
export async function requirePageUser(returnTo?: string): Promise<AuthIdentity> {
  await connection();
  const user = await getAuthenticatedUser();
  if (!user) {
    const destination = getProtectedReturnTo(returnTo);
    redirect(destination ? `/login?next=${encodeURIComponent(destination)}` : "/login");
  }
  return user;
}

type ApiAuthentication =
  { user: AuthIdentity; response?: never } | { user?: never; response: NextResponse };

// Return immediately when response is present. Only then call a resource
// service with user.id; S1-011 owns the resource ownership checks.
export async function requireApiUser(): Promise<ApiAuthentication> {
  await connection();
  try {
    const user = await getAuthenticatedUser();
    if (user) return { user };
    return { response: authFailureResponse(false) };
  } catch {
    return { response: authFailureResponse(true) };
  }
}

function authFailureResponse(unavailable: boolean) {
  return NextResponse.json(
    {
      success: false,
      error: unavailable
        ? {
            code: "AUTH_UNAVAILABLE",
            message: "Authentication is temporarily unavailable. Please try again later.",
          }
        : { code: "AUTH_REQUIRED", message: "Please sign in to continue." },
    },
    { status: unavailable ? 503 : 401, headers: { "Cache-Control": "private, no-store" } },
  );
}
