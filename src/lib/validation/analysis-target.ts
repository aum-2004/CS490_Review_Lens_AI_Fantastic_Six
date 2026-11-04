const MAX_TARGET_NAME_LENGTH = 120;
const MAX_SOURCE_URL_LENGTH = 2_048;

const TARGET_NAME_REQUIRED_MESSAGE = "Enter a name for this target.";
const TARGET_NAME_INVALID_CHARACTERS_MESSAGE = "Target names can't contain control characters.";
const TARGET_NAME_TOO_LONG_MESSAGE = "Target names can be up to 120 characters.";
const SOURCE_URL_REQUIRED_MESSAGE = "Enter the Google Maps link for this target.";
const SOURCE_URL_INVALID_MESSAGE =
  "That doesn't look like a valid web address. Paste the full link, starting with https://.";
const SOURCE_URL_TOO_LONG_MESSAGE = "Google Maps links can be up to 2,048 characters.";
const SOURCE_URL_UNSUPPORTED_PLATFORM_MESSAGE =
  "This link isn't a Google Maps link. Open the business in Google Maps and copy its link.";
const SOURCE_URL_MISSING_BUSINESS_MESSAGE =
  "This Google Maps link doesn't identify a business. Open a specific business and copy its link.";
const SOURCE_URL_SHORT_LINK_UNSUPPORTED_MESSAGE =
  "Shortened Google Maps links aren't supported yet. Open the full Google Maps URL in your browser and copy it from the address bar.";

const GOOGLE_MAPS_HOSTNAMES = new Set(["google.com", "www.google.com", "maps.google.com"]);
const SHORTENED_GOOGLE_MAPS_HOSTNAMES = new Set(["maps.app.goo.gl"]);
const GOOGLE_MAPS_PLACE_IDENTIFIER_PARAMETERS = ["cid", "place_id", "query_place_id"];

export const SUPPORTED_REVIEW_PLATFORM = "google_maps" as const;

export type SupportedReviewPlatform = typeof SUPPORTED_REVIEW_PLATFORM;

export interface ValidatedAnalysisTargetInput {
  name: string;
  sourceUrl: string;
  platform: SupportedReviewPlatform;
}

export type AnalysisTargetInputField = "name" | "sourceUrl";

export type AnalysisTargetValidationErrorCode =
  | "INVALID_INPUT_TYPE"
  | "TARGET_NAME_REQUIRED"
  | "TARGET_NAME_INVALID_TYPE"
  | "TARGET_NAME_INVALID_CHARACTERS"
  | "TARGET_NAME_TOO_LONG"
  | "SOURCE_URL_REQUIRED"
  | "SOURCE_URL_INVALID_TYPE"
  | "SOURCE_URL_MALFORMED"
  | "SOURCE_URL_UNSUPPORTED_PROTOCOL"
  | "SOURCE_URL_TOO_LONG"
  | "SOURCE_URL_UNSUPPORTED_PLATFORM";

export interface AnalysisTargetValidationIssue {
  field?: AnalysisTargetInputField;
  code: AnalysisTargetValidationErrorCode;
  message: string;
}

export type AnalysisTargetValidationResult =
  | {
      success: true;
      data: ValidatedAnalysisTargetInput;
    }
  | {
      success: false;
      error: {
        code: "INVALID_ANALYSIS_TARGET_INPUT";
        message: "Please fix the highlighted fields.";
        issues: readonly AnalysisTargetValidationIssue[];
      };
    };

function hasOwnProperty(input: Record<string, unknown>, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, property);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

function normalizeTargetName(value: string): string {
  return value.replace(/(?![\u200C\u200D])\p{Cf}/gu, "").trim();
}

function hasMeaningfulTargetName(value: string): boolean {
  return value.replace(/\p{Cf}/gu, "").trim().length > 0;
}

function hasUnsafeControlCharacters(value: string): boolean {
  return /\p{Cc}/u.test(value);
}

function hasPlaceIdentifier(url: URL): boolean {
  return GOOGLE_MAPS_PLACE_IDENTIFIER_PARAMETERS.some((parameter) => {
    const value = url.searchParams.get(parameter);
    return value !== null && value.trim().length > 0;
  });
}

function hasMeaningfulPlacePath(path: string): boolean {
  const placePathPrefix = "/maps/place/";

  if (!path.startsWith(placePathPrefix)) {
    return false;
  }

  const firstPlaceSegment = path.slice(placePathPrefix.length).split("/", 1)[0];

  try {
    const decodedPlaceSegment = decodeURIComponent(firstPlaceSegment);
    return decodedPlaceSegment.replace(/[\/+\s\p{C}]/gu, "").length > 0;
  } catch {
    return false;
  }
}

function isGoogleMapsBusinessUrl(url: URL): boolean {
  if (!GOOGLE_MAPS_HOSTNAMES.has(url.hostname) || url.username || url.password || url.port) {
    return false;
  }

  const path = url.pathname.toLowerCase();

  if (hasMeaningfulPlacePath(path)) {
    return true;
  }

  const acceptsBusinessQuery =
    path === "/maps" ||
    path === "/maps/" ||
    path === "/maps/search" ||
    path === "/maps/search/" ||
    (url.hostname === "maps.google.com" && path === "/");

  return acceptsBusinessQuery && hasPlaceIdentifier(url);
}

function isGoogleMapsUrl(url: URL): boolean {
  if (!GOOGLE_MAPS_HOSTNAMES.has(url.hostname) || url.username || url.password || url.port) {
    return false;
  }

  const path = url.pathname.toLowerCase();
  return url.hostname === "maps.google.com" || path === "/maps" || path.startsWith("/maps/");
}

function unsupportedGoogleMapsMessage(url: URL): string {
  if (
    SHORTENED_GOOGLE_MAPS_HOSTNAMES.has(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.port
  ) {
    return SOURCE_URL_SHORT_LINK_UNSUPPORTED_MESSAGE;
  }

  if (isGoogleMapsUrl(url)) {
    return SOURCE_URL_MISSING_BUSINESS_MESSAGE;
  }

  return SOURCE_URL_UNSUPPORTED_PLATFORM_MESSAGE;
}

function failure(issues: AnalysisTargetValidationIssue[]): AnalysisTargetValidationResult {
  return {
    success: false,
    error: {
      code: "INVALID_ANALYSIS_TARGET_INPUT",
      message: "Please fix the highlighted fields.",
      issues,
    },
  };
}

/**
 * Validates and normalizes data for one Google Maps analysis target.
 *
 * S1-015 integration contract: a protected server boundary must call this function with the
 * parsed request body and return the failure as HTTP 400 before invoking persistence. On success,
 * it may pass only `result.data` to the creation service and must derive ownership independently
 * from the authenticated session.
 *
 * Shortened URLs such as maps.app.goo.gl are intentionally unsupported until S1-020 confirms that
 * the ingestion provider can use them without redirect resolution.
 */
export function validateAnalysisTargetInput(input: unknown): AnalysisTargetValidationResult {
  if (!isRecord(input)) {
    return failure([
      {
        code: "INVALID_INPUT_TYPE",
        message: "Target information must be an object.",
      },
    ]);
  }

  const issues: AnalysisTargetValidationIssue[] = [];
  const rawName = hasOwnProperty(input, "name") ? input.name : undefined;
  const rawSourceUrl = hasOwnProperty(input, "sourceUrl") ? input.sourceUrl : undefined;

  let normalizedName: string | undefined;
  let normalizedSourceUrl: string | undefined;

  if (rawName === undefined || rawName === null) {
    issues.push({
      field: "name",
      code: "TARGET_NAME_REQUIRED",
      message: TARGET_NAME_REQUIRED_MESSAGE,
    });
  } else if (typeof rawName !== "string") {
    issues.push({
      field: "name",
      code: "TARGET_NAME_INVALID_TYPE",
      message: TARGET_NAME_REQUIRED_MESSAGE,
    });
  } else {
    normalizedName = normalizeTargetName(rawName);

    if (!hasMeaningfulTargetName(normalizedName)) {
      issues.push({
        field: "name",
        code: "TARGET_NAME_REQUIRED",
        message: TARGET_NAME_REQUIRED_MESSAGE,
      });
    } else if (!normalizedName.isWellFormed() || hasUnsafeControlCharacters(normalizedName)) {
      issues.push({
        field: "name",
        code: "TARGET_NAME_INVALID_CHARACTERS",
        message: TARGET_NAME_INVALID_CHARACTERS_MESSAGE,
      });
    } else if (characterCount(normalizedName) > MAX_TARGET_NAME_LENGTH) {
      issues.push({
        field: "name",
        code: "TARGET_NAME_TOO_LONG",
        message: TARGET_NAME_TOO_LONG_MESSAGE,
      });
    }
  }

  if (rawSourceUrl === undefined || rawSourceUrl === null) {
    issues.push({
      field: "sourceUrl",
      code: "SOURCE_URL_REQUIRED",
      message: SOURCE_URL_REQUIRED_MESSAGE,
    });
  } else if (typeof rawSourceUrl !== "string") {
    issues.push({
      field: "sourceUrl",
      code: "SOURCE_URL_INVALID_TYPE",
      message: SOURCE_URL_INVALID_MESSAGE,
    });
  } else {
    normalizedSourceUrl = rawSourceUrl.trim();

    if (normalizedSourceUrl.length === 0) {
      issues.push({
        field: "sourceUrl",
        code: "SOURCE_URL_REQUIRED",
        message: SOURCE_URL_REQUIRED_MESSAGE,
      });
    } else if (normalizedSourceUrl.length > MAX_SOURCE_URL_LENGTH) {
      issues.push({
        field: "sourceUrl",
        code: "SOURCE_URL_TOO_LONG",
        message: SOURCE_URL_TOO_LONG_MESSAGE,
      });
    } else if (!normalizedSourceUrl.isWellFormed()) {
      issues.push({
        field: "sourceUrl",
        code: "SOURCE_URL_MALFORMED",
        message: SOURCE_URL_INVALID_MESSAGE,
      });
    } else {
      let parsedUrl: URL | undefined;

      try {
        parsedUrl = new URL(normalizedSourceUrl);
      } catch {
        issues.push({
          field: "sourceUrl",
          code: "SOURCE_URL_MALFORMED",
          message: SOURCE_URL_INVALID_MESSAGE,
        });
      }

      if (parsedUrl) {
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          issues.push({
            field: "sourceUrl",
            code: "SOURCE_URL_UNSUPPORTED_PROTOCOL",
            message: SOURCE_URL_INVALID_MESSAGE,
          });
        } else if (!isGoogleMapsBusinessUrl(parsedUrl)) {
          issues.push({
            field: "sourceUrl",
            code: "SOURCE_URL_UNSUPPORTED_PLATFORM",
            message: unsupportedGoogleMapsMessage(parsedUrl),
          });
        } else if (parsedUrl.href.length > MAX_SOURCE_URL_LENGTH) {
          issues.push({
            field: "sourceUrl",
            code: "SOURCE_URL_TOO_LONG",
            message: SOURCE_URL_TOO_LONG_MESSAGE,
          });
        } else {
          normalizedSourceUrl = parsedUrl.href;
        }
      }
    }
  }

  if (issues.length > 0 || normalizedName === undefined || normalizedSourceUrl === undefined) {
    return failure(issues);
  }

  return {
    success: true,
    data: {
      name: normalizedName,
      sourceUrl: normalizedSourceUrl,
      platform: SUPPORTED_REVIEW_PLATFORM,
    },
  };
}
