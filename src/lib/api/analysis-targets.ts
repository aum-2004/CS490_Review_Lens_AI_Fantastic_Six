import type { AnalysisTarget, CreateAnalysisTarget } from "@/types/analysis-target";
import type { AnalysisTargetValidationIssue } from "@/lib/validation/analysis-target";

type AnalysisTargetCreationErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATION_UNAVAILABLE"
  | "INVALID_ANALYSIS_TARGET_INPUT"
  | "CREATION_UNAVAILABLE"
  | "CREATION_FAILED";

interface ErrorPayload {
  success: false;
  error: {
    code?: unknown;
    message?: unknown;
    issues?: unknown;
  };
}

export class AnalysisTargetCreationError extends Error {
  constructor(
    public readonly code: AnalysisTargetCreationErrorCode,
    message: string,
    public readonly issues: readonly AnalysisTargetValidationIssue[] = [],
  ) {
    super(message);
    this.name = "AnalysisTargetCreationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  return isRecord(value) && value.success === false && isRecord(value.error);
}

function isValidationIssue(value: unknown): value is AnalysisTargetValidationIssue {
  if (!isRecord(value) || typeof value.code !== "string" || typeof value.message !== "string") {
    return false;
  }

  return value.field === undefined || value.field === "name" || value.field === "sourceUrl";
}

function readValidationIssues(value: unknown): readonly AnalysisTargetValidationIssue[] {
  return Array.isArray(value) && value.every(isValidationIssue) ? value : [];
}

function isAnalysisTarget(value: unknown): value is AnalysisTarget {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    typeof value.sourceUrl === "string" &&
    value.platform === "google_maps"
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Browser-side client for the authenticated S1-011 creation endpoint.
 * Ownership is intentionally absent from the request body and must be derived by the server.
 */
export const createAnalysisTarget: CreateAnalysisTarget = async ({ name, sourceUrl }) => {
  let response: Response;

  try {
    response = await fetch("/api/analysis-targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, sourceUrl }),
    });
  } catch {
    throw new AnalysisTargetCreationError(
      "CREATION_UNAVAILABLE",
      "We couldn't reach ReviewLens. Check your connection and try again.",
    );
  }

  const payload = await readJson(response);

  if (response.status === 401) {
    throw new AnalysisTargetCreationError(
      "AUTHENTICATION_REQUIRED",
      "Your session has expired. Please sign in again.",
    );
  }

  if (response.status === 400 && isErrorPayload(payload)) {
    throw new AnalysisTargetCreationError(
      "INVALID_ANALYSIS_TARGET_INPUT",
      typeof payload.error.message === "string"
        ? payload.error.message
        : "Please fix the highlighted fields.",
      readValidationIssues(payload.error.issues),
    );
  }

  if (
    response.status === 503 &&
    isErrorPayload(payload) &&
    payload.error.code === "AUTH_UNAVAILABLE"
  ) {
    throw new AnalysisTargetCreationError(
      "AUTHENTICATION_UNAVAILABLE",
      "Authentication is temporarily unavailable. Please try again later.",
    );
  }

  if (!response.ok) {
    throw new AnalysisTargetCreationError(
      response.status === 404 ? "CREATION_UNAVAILABLE" : "CREATION_FAILED",
      response.status === 404
        ? "Target creation is temporarily unavailable. Please try again later."
        : "We couldn't create this target. Please try again.",
    );
  }

  if (!isRecord(payload) || payload.success !== true || !isAnalysisTarget(payload.data)) {
    throw new AnalysisTargetCreationError(
      "CREATION_FAILED",
      "ReviewLens returned an unexpected response. Please try again.",
    );
  }

  return payload.data;
};
