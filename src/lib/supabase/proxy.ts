import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { getProtectedReturnTo } from "@/lib/validation/return-to";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const privateHeaders: Record<string, string> = {
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
  const protectedPage = getProtectedReturnTo(request.nextUrl.pathname) !== null;
  let authenticated = false;
  let unavailable = false;

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
    const { data, error } = await supabase.auth.getClaims();
    authenticated = !error && typeof data?.claims?.sub === "string" && !!data.claims.sub;
    if (error && (!error.status || error.status >= 500 || error.status === 429)) {
      unavailable = true;
    }
  } catch {
    // Pages/actions independently verify identity and show a safe failure state.
    // Keep public startup usable when Supabase is not configured or reachable.
    console.warn("Session refresh unavailable", { operation: "refresh-session" });
    unavailable = true;
  }

  if (protectedPage && !authenticated) {
    const previousResponse = response;
    if (unavailable) {
      response = new NextResponse(
        "Authentication is temporarily unavailable. Please try again later.",
        {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        },
      );
    } else {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      // 303 avoids replaying a protected POST (including a Server Action) at /login.
      response = NextResponse.redirect(loginUrl, 303);
    }
    for (const cookie of previousResponse.cookies.getAll()) response.cookies.set(cookie);
  }

  for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
  return response;
}
