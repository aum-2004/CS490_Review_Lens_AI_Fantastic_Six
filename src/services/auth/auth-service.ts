import "server-only";

import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authCredentialsSchema, type AuthIdentity, type AuthResult } from "@/lib/validation/auth";

const unavailableMessage = "Authentication is temporarily unavailable. Please try again later.";
const invalidSessionCodes = new Set([
  "bad_jwt",
  "user_not_found",
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "user_banned",
]);

function logFailure(operation: string) {
  // Deliberately omit provider errors, credentials, cookies, and user identifiers.
  console.warn("Authentication operation failed", { operation });
}

export async function getAuthenticatedUser(): Promise<AuthIdentity | null> {
  try {
    const supabase = await createSupabaseServerClient();
    // getUser verifies with Supabase Auth; cookie contents alone are never identity.
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (
        isAuthSessionMissingError(error) ||
        error.status === 401 ||
        error.status === 403 ||
        (error.code && invalidSessionCodes.has(error.code))
      )
        return null;
      throw new Error(unavailableMessage);
    }
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  } catch {
    logFailure("current-user");
    throw new Error(unavailableMessage);
  }
}

export async function authenticate(
  input: unknown,
  mode: "sign-in" | "register",
): Promise<AuthResult> {
  const parsed = authCredentialsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: AuthResult["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if ((field === "email" || field === "password") && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { success: false, message: "Please fix the highlighted fields.", fieldErrors };
  }

  try {
    const supabase = await createSupabaseServerClient(true);
    const { data, error } =
      mode === "register"
        ? await supabase.auth.signUp(parsed.data)
        : await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
      logFailure(mode);
      const message =
        error.status && error.status >= 500
          ? unavailableMessage
          : error.status === 429
            ? "Too many attempts. Please wait a moment and try again."
            : mode === "register"
              ? "We couldn't create your account. Check your details and the password requirements, then try again."
              : "We couldn't sign you in. Check your email and password and try again.";
      return { success: false, message };
    }
    if (mode === "register" && !data.session) {
      return {
        success: true,
        requiresConfirmation: true,
        message:
          "Check your email for a confirmation link. After confirming, return here to sign in.",
      };
    }
    if (!data.session || !data.user) return { success: false, message: unavailableMessage };
    return { success: true };
  } catch {
    logFailure(mode);
    return { success: false, message: unavailableMessage };
  }
}

export async function endSession(): Promise<AuthResult> {
  try {
    const supabase = await createSupabaseServerClient(true);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      logFailure("sign-out");
      return { success: false, message: "We couldn't sign you out. Please try again." };
    }
    return { success: true };
  } catch {
    logFailure("sign-out");
    return { success: false, message: unavailableMessage };
  }
}

export async function confirmEmail(tokenHash: string): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient(true);
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (error || !data.session) {
      logFailure("confirm-email");
      return false;
    }
    return true;
  } catch {
    logFailure("confirm-email");
    return false;
  }
}
