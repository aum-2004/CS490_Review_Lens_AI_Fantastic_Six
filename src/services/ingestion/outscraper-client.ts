import "server-only";

import { validateAnalysisTargetInput } from "@/lib/validation/analysis-target";
import { readBoundedProviderJson } from "./bounded-provider-json";
import { IngestionLimitError, MAX_INGESTED_REVIEWS } from "./ingestion-limits";
import { toStorableText } from "@/services/reviews/storable-text";

const OUTSCRAPER_URL = "https://api.outscraper.cloud/google-maps-reviews";
const GOOGLE_PLACE_ID_PATTERN = /^ChIJ[A-Za-z0-9_-]+$/;

export type OutscraperJob = {
  id: string;
  status: string;
};

export type OutscraperQuery =
  { kind: "place_id"; value: string } | { kind: "source_url"; value: string };

export type VerifiedBusinessIdentity = {
  placeId: string;
  googleId?: string;
  businessName: string;
  locationLink?: string;
};

export type OutscraperExpectedIdentity = {
  sourceUrl: string;
  googlePlaceId: string | null;
};

export class OutscraperError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly submissionRejected = false,
  ) {
    super(message);
    this.name = "OutscraperError";
  }
}

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (("name" in error && error.name === "TimeoutError") ||
      ("code" in error && error.code === "ETIMEDOUT"))
  );
}

function providerFetchError(error: unknown): OutscraperError {
  return isTimeoutError(error)
    ? new OutscraperError("PROVIDER_TIMEOUT", "The review service request timed out.")
    : new OutscraperError("PROVIDER_UNAVAILABLE", "The review service could not be reached.");
}

export async function startOutscraperExtraction(
  query: OutscraperQuery | string,
  fetcher?: typeof fetch,
  recoveryUrl?: string,
): Promise<OutscraperJob> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  const normalizedQuery: OutscraperQuery =
    typeof query === "string" ? { kind: "place_id", value: query } : query;

  if (!apiKey) {
    throw new OutscraperError("MISSING_API_KEY", "Outscraper is not configured.");
  }

  if (normalizedQuery.kind === "place_id" && !isGooglePlaceId(normalizedQuery.value)) {
    throw new OutscraperError(
      "INVALID_PLACE_ID",
      "The Google Maps business identifier is invalid.",
    );
  }

  if (
    normalizedQuery.kind === "source_url" &&
    !validateAnalysisTargetInput({ name: "review source", sourceUrl: normalizedQuery.value })
      .success
  ) {
    throw new OutscraperError("INVALID_SOURCE_URL", "The Google Maps source URL is invalid.");
  }

  const url = new URL(OUTSCRAPER_URL);

  url.searchParams.set("query", normalizedQuery.value);
  url.searchParams.set("reviewsLimit", "30");
  url.searchParams.set("sort", "most_relevant");
  url.searchParams.set("ignoreEmpty", "true");
  url.searchParams.set("async", "true");
  if (recoveryUrl) url.searchParams.set("webhook", recoveryUrl);

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
  } catch (error) {
    throw providerFetchError(error);
  }

  if (response.status === 429) {
    throw new OutscraperError(
      "PROVIDER_QUOTA",
      "The review service usage limit was reached.",
      true,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new OutscraperError(
      "PROVIDER_AUTH",
      "The review service rejected its credentials.",
      true,
    );
  }

  if (response.status === 402) {
    throw new OutscraperError(
      "PROVIDER_BILLING",
      "The review service account requires attention.",
      true,
    );
  }

  if (!response.ok) {
    if (response.status >= 400 && response.status < 500 && response.status !== 408) {
      throw new OutscraperError(
        "PROVIDER_REJECTED",
        "The review service rejected this request.",
        true,
      );
    }
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
      identity: VerifiedBusinessIdentity;
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
  expectedIdentity: string | OutscraperExpectedIdentity,
  fetcher?: typeof fetch,
): Promise<OutscraperResult> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;

  if (!apiKey?.trim()) {
    throw new OutscraperError("MISSING_API_KEY", "Outscraper is not configured.");
  }

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) {
    throw new OutscraperError("INVALID_REQUEST_ID", "The extraction request ID is invalid.");
  }

  const expectedPlaceId =
    typeof expectedIdentity === "string" ? expectedIdentity : expectedIdentity.googlePlaceId;
  const sourceUrl = typeof expectedIdentity === "string" ? undefined : expectedIdentity.sourceUrl;

  if (expectedPlaceId !== null && !isGooglePlaceId(expectedPlaceId)) {
    throw new OutscraperError(
      "INVALID_PLACE_ID",
      "The Google Maps business identifier is invalid.",
    );
  }

  if (
    sourceUrl !== undefined &&
    !validateAnalysisTargetInput({ name: "review source", sourceUrl }).success
  ) {
    throw new OutscraperError("INVALID_SOURCE_URL", "The Google Maps source URL is invalid.");
  }

  if (expectedPlaceId === null && sourceUrl === undefined) {
    throw new OutscraperError("INVALID_IDENTITY_CONTRACT", "A source URL or Place ID is required.");
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
  } catch (error) {
    throw providerFetchError(error);
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
      "PROVIDER_UNAVAILABLE",
      "The review service could not retrieve the results.",
    );
  }

  let payload: unknown;

  try {
    payload = await readBoundedProviderJson(response);
  } catch (error) {
    if (error instanceof IngestionLimitError) throw error;
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
  if (payload.data.length > MAX_INGESTED_REVIEWS)
    throw new IngestionLimitError("INGESTION_RESULT_LIMIT");

  // The live Outscraper API returns a flat array of review records.
  // Each record includes its own place_id and business name.
  const isFlatResponse =
    payload.data.every(isRecord) &&
    !payload.data.some((item: Record<string, unknown>) => Array.isArray(item.reviews_data));

  if (isFlatResponse) {
    const reviews: Record<string, unknown>[] = payload.data;

    const placeIds = uniqueNonEmptyStrings(reviews.map((review) => review.place_id));

    if (reviews.some((review) => typeof review.place_id !== "string" || !review.place_id.trim())) {
      throw new OutscraperError(
        "IDENTITY_MISSING",
        "The review service returned a review without a business identity.",
      );
    }

    if (placeIds.length === 0) {
      throw new OutscraperError(
        "IDENTITY_MISSING",
        "The review service did not return a business identity.",
      );
    }

    if (placeIds.some((placeId) => !isGooglePlaceId(placeId))) {
      throw new OutscraperError(
        "IDENTITY_MISSING",
        "The review service did not return a valid Google business identifier.",
      );
    }

    if (expectedPlaceId !== null && placeIds.some((placeId) => placeId !== expectedPlaceId)) {
      throw new OutscraperError(
        "BUSINESS_MISMATCH",
        "The provider returned reviews for a different business.",
      );
    }

    if (placeIds.length !== 1) {
      throw new OutscraperError(
        "IDENTITY_AMBIGUOUS",
        "The review service returned more than one business.",
      );
    }

    const resolvedPlaceId = placeIds[0];

    const businessName =
      typeof reviews[0].name === "string"
        ? toStorableText(reviews[0].name).trim()
        : reviews[0].name;

    if (typeof businessName !== "string" || !businessName.trim()) {
      throw new OutscraperError(
        "IDENTITY_MISSING",
        "The provider did not return a valid business identity.",
      );
    }

    // Make sure all returned records belong to the same business.
    if (
      reviews.some(
        (review) =>
          typeof review.name !== "string" || toStorableText(review.name).trim() !== businessName,
      )
    ) {
      throw new OutscraperError(
        "IDENTITY_AMBIGUOUS",
        "The provider returned inconsistent business information.",
      );
    }

    const googleIds = uniqueNonEmptyStrings(reviews.map((review) => review.google_id));
    if (googleIds.length > 1) {
      throw new OutscraperError(
        "IDENTITY_AMBIGUOUS",
        "The provider returned inconsistent business identifiers.",
      );
    }

    const locationLinks = uniqueNonEmptyStrings(reviews.map((review) => review.location_link));
    if (locationLinks.length > 1) {
      throw new OutscraperError(
        "IDENTITY_AMBIGUOUS",
        "The provider returned inconsistent business locations.",
      );
    }

    return {
      status: "completed",
      businessName,
      placeId: resolvedPlaceId,
      identity: {
        placeId: resolvedPlaceId,
        ...(googleIds[0] ? { googleId: googleIds[0] } : {}),
        businessName,
        ...(locationLinks[0] ? { locationLink: locationLinks[0] } : {}),
      },
      reviews,
    };
  }

  // Also support nested business responses.
  const places = payload.data.flatMap((group: unknown) => (Array.isArray(group) ? group : [group]));

  if (places.length !== 1) {
    throw new OutscraperError(
      "IDENTITY_AMBIGUOUS",
      "The review service returned more than one business.",
    );
  }

  const business = places[0];

  if (!isRecord(business)) {
    throw new OutscraperError(
      "IDENTITY_MISSING",
      "The review source did not return a business identity.",
    );
  }

  if (typeof business.place_id !== "string" || !isGooglePlaceId(business.place_id)) {
    throw new OutscraperError(
      "IDENTITY_MISSING",
      "The review source did not return a valid business identity.",
    );
  }

  if (expectedPlaceId !== null && business.place_id !== expectedPlaceId) {
    throw new OutscraperError(
      "BUSINESS_MISMATCH",
      "The review source returned a different business.",
    );
  }

  if (
    typeof business.name !== "string" ||
    !business.name.trim() ||
    !Array.isArray(business.reviews_data) ||
    !business.reviews_data.every(isRecord)
  ) {
    throw new OutscraperError(
      "IDENTITY_MISSING",
      "The review provider returned incomplete business identity data.",
    );
  }

  if (business.reviews_data.length === 0) {
    throw new OutscraperError("NO_REVIEWS", "No reviews were found for this business.");
  }
  if (business.reviews_data.length > MAX_INGESTED_REVIEWS)
    throw new IngestionLimitError("INGESTION_RESULT_LIMIT");

  const parentGoogleId = getOptionalIdentityField(business.google_id, "Google ID");
  const parentLocationLink = getOptionalIdentityField(business.location_link, "location link");
  const parentBusinessName = toStorableText(business.name).trim();
  if (!parentBusinessName)
    throw new OutscraperError("IDENTITY_MISSING", "The provider business name is empty.");
  const childBusinessNames = business.reviews_data.map((review) =>
    getOptionalIdentityField(review.name, "business name"),
  );
  const childGoogleIds = business.reviews_data.map((review) =>
    getOptionalIdentityField(review.google_id, "Google ID"),
  );
  const childLocationLinks = business.reviews_data.map((review) =>
    getOptionalIdentityField(review.location_link, "location link"),
  );

  if (
    (parentGoogleId !== undefined &&
      childGoogleIds.some((googleId) => googleId !== undefined && googleId !== parentGoogleId)) ||
    uniqueNonEmptyStrings(childGoogleIds).length > 1
  ) {
    throw new OutscraperError(
      "IDENTITY_AMBIGUOUS",
      "The review provider returned conflicting Google business identifiers.",
    );
  }

  if (
    childBusinessNames.some(
      (businessName) => businessName !== undefined && businessName !== parentBusinessName,
    )
  ) {
    throw new OutscraperError(
      "IDENTITY_AMBIGUOUS",
      "The review provider returned inconsistent business names.",
    );
  }

  if (
    (parentLocationLink !== undefined &&
      childLocationLinks.some(
        (locationLink) => locationLink !== undefined && locationLink !== parentLocationLink,
      )) ||
    uniqueNonEmptyStrings(childLocationLinks).length > 1
  ) {
    throw new OutscraperError(
      "IDENTITY_AMBIGUOUS",
      "The review provider returned conflicting business locations.",
    );
  }

  return {
    status: "completed",
    businessName: parentBusinessName,
    placeId: business.place_id,
    identity: {
      placeId: business.place_id,
      ...(parentGoogleId ? { googleId: parentGoogleId } : {}),
      businessName: parentBusinessName,
      ...(parentLocationLink ? { locationLink: parentLocationLink } : {}),
    },
    reviews: business.reviews_data,
  };
}

function uniqueNonEmptyStrings(values: unknown[]): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ),
    ),
  ];
}

function isGooglePlaceId(value: string): boolean {
  return GOOGLE_PLACE_ID_PATTERN.test(value);
}

function getOptionalIdentityField(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new OutscraperError(
      "IDENTITY_MISSING",
      `The review provider returned an invalid ${label}.`,
    );
  }

  const normalized = (label === "business name" ? toStorableText(value) : value).trim();
  return normalized || undefined;
}
