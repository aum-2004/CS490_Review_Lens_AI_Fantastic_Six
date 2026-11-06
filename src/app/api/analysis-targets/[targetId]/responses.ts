import { NextResponse } from "next/server";

/** Shared by the target child routes so every denial has exactly the same shape (S1-013). */
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: PRIVATE_HEADERS },
  );
}

/** Missing, foreign, and malformed target ids all get this one response. */
export function targetNotFoundResponse() {
  return errorResponse(404, "TARGET_NOT_FOUND", "Analysis target not found.");
}

export function successResponse(status: number, data: unknown) {
  return NextResponse.json({ success: true, data }, { status, headers: PRIVATE_HEADERS });
}

/** Logs only the operation and an error category: no input, ids, or provider details. */
export function logFailure(operation: string, error: unknown) {
  const category =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "UNEXPECTED_ERROR";
  console.error("Analysis target child operation failed", { operation, category });
}
