import { NextResponse } from "next/server";
import { requireApiUser } from "@/services/auth/access-control";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  return NextResponse.json(
    { success: true, data: { user: auth.user } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
