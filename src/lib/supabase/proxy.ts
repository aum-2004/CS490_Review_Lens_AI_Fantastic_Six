import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const privateHeaders: Record<string, string> = {
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };

  try {
    const { url, publishableKey } = getSupabasePublicConfig();
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          // Preserve earlier writes if the SDK calls setAll more than once.
          const previousCookies = response.cookies.getAll();
          response = NextResponse.next({ request });
          for (const cookie of previousCookies) response.cookies.set(cookie);
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          Object.assign(privateHeaders, headers);
        },
      },
    });
    await supabase.auth.getClaims();
  } catch {
    // Pages/actions independently verify identity and show a safe failure state.
    // Keep public startup usable when Supabase is not configured or reachable.
    console.warn("Session refresh unavailable", { operation: "refresh-session" });
  }

  for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
  return response;
}
