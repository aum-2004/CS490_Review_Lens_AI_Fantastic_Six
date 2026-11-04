import "server-only";

const OUTSCRAPER_URL = "https://api.outscraper.cloud/google-maps-reviews";

export type OutscraperJob = {
  id: string;
  status: string;
};

export class OutscraperError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OutscraperError";
  }
}

export async function startOutscraperExtraction(
  placeId: string,
  fetcher?: typeof fetch,
): Promise<OutscraperJob> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;

  if (!apiKey) {
    throw new OutscraperError("MISSING_API_KEY", "Outscraper is not configured.");
  }

  if (!/^ChIJ[A-Za-z0-9_-]+$/.test(placeId)) {
    throw new OutscraperError(
      "INVALID_PLACE_ID",
      "The Google Maps business identifier is invalid.",
    );
  }

  const url = new URL(OUTSCRAPER_URL);

  url.searchParams.set("query", placeId);
  url.searchParams.set("reviewsLimit", "30");
  url.searchParams.set("sort", "most_relevant");
  url.searchParams.set("ignoreEmpty", "true");
  url.searchParams.set("async", "true");

  let response: Response;

  try {
    response = await (fetcher ?? fetch)(url, {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new OutscraperError("PROVIDER_UNAVAILABLE", "The review service could not be reached.");
  }

  if (response.status === 429) {
    throw new OutscraperError("PROVIDER_QUOTA", "The review service usage limit was reached.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new OutscraperError("PROVIDER_AUTH", "The review service rejected its credentials.");
  }

  if (response.status === 402) {
    throw new OutscraperError("PROVIDER_BILLING", "The review service account requires attention.");
  }

  if (!response.ok) {
    throw new OutscraperError("PROVIDER_FAILED", "The review service could not start extraction.");
  }

  let result: unknown;

  try {
    result = await response.json();
  } catch {
    throw new OutscraperError(
      "INVALID_RESPONSE",
      "The review service returned an invalid response.",
    );
  }

  if (!isRecord(result) || typeof result.id !== "string" || typeof result.status !== "string") {
    throw new OutscraperError("INVALID_RESPONSE", "The review service did not return a valid job.");
  }

  return {
    id: result.id,
    status: result.status,
  };
}

export type OutscraperResult =
  | { status: "pending" }
  | {
      status: "completed";
      businessName: string;
      placeId: string;
      reviews: Record<string, unknown>[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Retrieves the status and results of an existing job.
 * Does not start a new extraction or use sample reviews.
 */
export async function getOutscraperResult(
  requestId: string,
  expectedPlaceId: string,
  fetcher?: typeof fetch,
): Promise<OutscraperResult> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;

  if (!apiKey?.trim()) {
    throw new OutscraperError("MISSING_API_KEY", "Outscraper is not configured.");
  }

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) {
    throw new OutscraperError("INVALID_REQUEST_ID", "The extraction request ID is invalid.");
  }

  if (!/^ChIJ[A-Za-z0-9_-]+$/.test(expectedPlaceId)) {
    throw new OutscraperError(
      "INVALID_PLACE_ID",
      "The Google Maps business identifier is invalid.",
    );
  }

  const url = new URL(`/requests/${encodeURIComponent(requestId)}`, "https://api.outscraper.cloud");

  let response: Response;

  try {
    response = await (fetcher ?? fetch)(url, {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new OutscraperError("PROVIDER_UNAVAILABLE", "The review service could not be reached.");
  }

  if (response.status === 429) {
    throw new OutscraperError("PROVIDER_QUOTA", "The review service usage limit was reached.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new OutscraperError("PROVIDER_AUTH", "The review service rejected its credentials.");
  }

  if (response.status === 402) {
    throw new OutscraperError("PROVIDER_BILLING", "The review service account requires attention.");
  }

  if (response.status === 204) {
    throw new OutscraperError("PROVIDER_FAILED", "The review extraction failed.");
  }

  if (!response.ok) {
    throw new OutscraperError(
      "PROVIDER_FAILED",
      "The review service could not retrieve the results.",
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new OutscraperError("INVALID_RESPONSE", "The review service returned invalid JSON.");
  }

  if (!isRecord(payload) || typeof payload.status !== "string") {
    throw new OutscraperError("INVALID_RESPONSE", "The review service returned an invalid result.");
  }

  if (payload.status === "Pending" || payload.status === "Running") {
    return { status: "pending" };
  }

  if (payload.status === "Failure") {
    throw new OutscraperError("PROVIDER_FAILED", "The review extraction failed.");
  }

  if (payload.status !== "Success" || !Array.isArray(payload.data)) {
    throw new OutscraperError("INVALID_RESPONSE", "The review results are unavailable.");
  }

  if (payload.data.length === 0) {
    throw new OutscraperError("NO_REVIEWS", "No reviews were found for this business.");
  }

  // The live Outscraper API returns a flat array of review records.
  // Each record includes its own place_id and business name.
  const isFlatResponse =
    payload.data.every(isRecord) &&
    !payload.data.some((item: Record<string, unknown>) => Array.isArray(item.reviews_data));

  if (isFlatResponse) {
    const reviews: Record<string, unknown>[] = payload.data;

    // Reject records belonging to a different Google Maps business.
    if (reviews.some((review) => review.place_id !== expectedPlaceId)) {
      throw new OutscraperError(
        "BUSINESS_MISMATCH",
        "The provider returned reviews for a different business.",
      );
    }

    const businessName = reviews[0].name;

    if (typeof businessName !== "string" || !businessName.trim()) {
      throw new OutscraperError(
        "INVALID_RESPONSE",
        "The provider did not return a valid business name.",
      );
    }

    // Make sure all returned records belong to the same business.
    if (reviews.some((review) => review.name !== businessName)) {
      throw new OutscraperError(
        "BUSINESS_MISMATCH",
        "The provider returned inconsistent business information.",
      );
    }

    return {
      status: "completed",
      businessName,
      placeId: expectedPlaceId,
      reviews,
    };
  }

  // Also support nested business responses.
  const places = payload.data.flatMap((group: unknown) => (Array.isArray(group) ? group : [group]));

  const business = places.find(
    (place: unknown) => isRecord(place) && place.place_id === expectedPlaceId,
  );

  if (!isRecord(business)) {
    throw new OutscraperError(
      "BUSINESS_MISMATCH",
      "The review source returned a different business.",
    );
  }

  if (
    typeof business.name !== "string" ||
    !Array.isArray(business.reviews_data) ||
    !business.reviews_data.every(isRecord)
  ) {
    throw new OutscraperError(
      "INVALID_RESPONSE",
      "The review provider returned invalid business data.",
    );
  }

  if (business.reviews_data.length === 0) {
    throw new OutscraperError("NO_REVIEWS", "No reviews were found for this business.");
  }

  return {
    status: "completed",
    businessName: business.name,
    placeId: expectedPlaceId,
    reviews: business.reviews_data,
  };
}
