import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";

/** Only the ingestion RPC repository uses this client. Never pass it to a page or browser. */
export function createIngestionAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key?.trim()) throw new Error("Ingestion storage is not configured.");
  return createClient(getSupabasePublicConfig().url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
