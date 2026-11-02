
import { getSupabasePublicConfig } from "../../src/lib/supabase/config";

describe("Supabase environment configuration", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      "fake-test-key";
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
        originalKey;
    }
  });

  test("returns valid Supabase configuration", () => {
    expect(getSupabasePublicConfig()).toEqual({
      url: "https://test.supabase.co",
      publishableKey: "fake-test-key",
    });
  });

  test("rejects missing Supabase URL", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(() => getSupabasePublicConfig()).toThrow(
      "Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL"
    );
  });

  test("rejects missing publishable key", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(() => getSupabasePublicConfig()).toThrow(
      "Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  });

  test("rejects both missing variables", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(() => getSupabasePublicConfig()).toThrow(
      "Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  });

  test("rejects empty or whitespace-only values", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "   ";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";

    expect(() => getSupabasePublicConfig()).toThrow(
      "Missing required Supabase environment variables"
    );
  });

  test("rejects malformed Supabase URLs", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-valid-url";

    expect(() => getSupabasePublicConfig()).toThrow(
      "Invalid NEXT_PUBLIC_SUPABASE_URL"
    );
  });

  test("rejects unsupported URL protocols", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "ftp://test.supabase.co";

    expect(() => getSupabasePublicConfig()).toThrow(
      "Invalid NEXT_PUBLIC_SUPABASE_URL"
    );
  });

  test("does not expose configuration values in errors", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "secret-invalid-url";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      "fake-sensitive-key-value";

    let errorMessage = "";

    try {
      getSupabasePublicConfig();
    } catch (error) {
      if (error instanceof Error) {
        errorMessage = error.message;
      }
    }

    expect(errorMessage).toContain(
      "Invalid NEXT_PUBLIC_SUPABASE_URL"
    );
    expect(errorMessage).not.toContain(
      "secret-invalid-url"
    );
    expect(errorMessage).not.toContain(
      "fake-sensitive-key-value"
    );
  });
});
