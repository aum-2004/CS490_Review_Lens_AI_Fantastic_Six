import { connection, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";

export async function GET() {
  await connection();
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." },
        },
        { status: 401, headers },
      );
    }
    return NextResponse.json({ success: true, data: { user } }, { headers });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "AUTH_UNAVAILABLE",
          message: "Authentication is temporarily unavailable. Please try again later.",
        },
      },
      { status: 503, headers },
    );
  }
}
