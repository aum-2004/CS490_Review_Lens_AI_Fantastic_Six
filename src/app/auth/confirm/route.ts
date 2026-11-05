import { NextResponse, type NextRequest } from "next/server";
import { confirmEmail } from "@/services/auth/auth-service";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const confirmed = !!tokenHash && type === "email" && (await confirmEmail(tokenHash));
  // Fixed local destination: do not forward tokens or trust a next/redirect query.
  const destination = new URL("/login", request.url);
  if (!confirmed) destination.searchParams.set("notice", "confirmation-error");
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
