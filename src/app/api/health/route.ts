import { connection } from "next/server";

// Liveness check. connection() opts out of build-time prerendering so the
// response reflects the running server rather than a cached build artifact.
export async function GET() {
  await connection();

  return Response.json({ success: true, data: { status: "ok" } });
}
