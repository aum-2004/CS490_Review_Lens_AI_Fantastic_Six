import "server-only";

import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

/** Use writable only in Server Actions or Route Handlers, never during rendering. */
export async function createSupabaseServerClient(writable = false) {
  const { url, publishableKey } = getSupabasePublicConfig();
  const cookieStore = await cookies();

  const adapter: CookieMethodsServer = { getAll: () => cookieStore.getAll() };
  if (writable) {
    adapter.setAll = (cookiesToSet) => {
      for (const { name, value, options } of cookiesToSet) {
        cookieStore.set(name, value, options);
      }
    };
  }
  return createServerClient(url, publishableKey, { cookies: adapter });
}
