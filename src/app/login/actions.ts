"use server";

import { revalidatePath } from "next/cache";
import { authenticate, endSession } from "@/services/auth/auth-service";

export async function signIn(input: unknown) {
  const result = await authenticate(input, "sign-in");
  if (result.success) revalidatePath("/login", "page");
  return result;
}

export async function register(input: unknown) {
  const result = await authenticate(input, "register");
  if (result.success) revalidatePath("/login", "page");
  return result;
}

export async function signOut() {
  const result = await endSession();
  if (result.success) revalidatePath("/", "layout");
  return result;
}
