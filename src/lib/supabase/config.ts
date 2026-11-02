
export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    const missing: string[] = [];

    if (!url) {
      missing.push("NEXT_PUBLIC_SUPABASE_URL");
    }

    if (!publishableKey) {
      missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    }

    throw new Error(
      `Missing required Supabase environment variables: ${missing.join(", ")}. Check .env.local.`
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_URL. Expected a valid HTTP or HTTPS URL."
    );
  }

  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.protocol !== "http:"
  ) {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_URL. Expected a valid HTTP or HTTPS URL."
    );
  }

  return {
    url,
    publishableKey,
  };
}
