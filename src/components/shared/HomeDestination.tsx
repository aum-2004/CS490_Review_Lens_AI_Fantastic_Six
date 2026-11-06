import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/services/auth/auth-service";

export async function HomeDestination() {
  await connection();
  let signedIn = false;
  try {
    signedIn = (await getAuthenticatedUser()) !== null;
  } catch {
    // Login supplies safe provider-unavailable feedback; never expose raw errors here.
  }
  return redirect(signedIn ? "/analysis-targets" : "/login");
}
