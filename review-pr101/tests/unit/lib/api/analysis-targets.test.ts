/** @jest-environment node */

import { AnalysisTargetCreationError, createAnalysisTarget } from "@/lib/api/analysis-targets";

const input = {
  name: "NJIT",
  sourceUrl: "https://www.google.com/maps/place/NJIT/@40.742,-74.179,17z",
  platform: "google_maps" as const,
};

const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

describe("createAnalysisTarget browser client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it("posts only the validated creation fields and accepts a genuine 201 response", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          success: true,
          data: { id: "target-1", ...input },
        },
        { status: 201 },
      ),
    );

    await expect(createAnalysisTarget(input)).resolves.toEqual({ id: "target-1", ...input });
    expect(fetchMock).toHaveBeenCalledWith("/api/analysis-targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: input.name, sourceUrl: input.sourceUrl }),
    });
    expect(fetchMock.mock.calls[0]?.[1]?.body).not.toContain("owner");
    expect(fetchMock.mock.calls[0]?.[1]?.body).not.toContain("user");
  });

  it("translates a 401 response into an authentication error", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { success: false, error: { code: "AUTH_REQUIRED", message: "Sign in." } },
        { status: 401 },
      ),
    );

    await expect(createAnalysisTarget(input)).rejects.toMatchObject({
      name: "AnalysisTargetCreationError",
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("preserves safe field issues from a 400 response", async () => {
    const issues = [
      {
        field: "sourceUrl" as const,
        code: "SOURCE_URL_UNSUPPORTED_PLATFORM" as const,
        message: "Use a supported Google Maps URL.",
      },
    ];
    fetchMock.mockResolvedValue(
      Response.json(
        {
          success: false,
          error: {
            code: "INVALID_ANALYSIS_TARGET_INPUT",
            message: "Please fix the highlighted fields.",
            issues,
          },
        },
        { status: 400 },
      ),
    );

    await expect(createAnalysisTarget(input)).rejects.toMatchObject({
      code: "INVALID_ANALYSIS_TARGET_INPUT",
      issues,
    });
  });

  it("reports a temporary authentication outage without exposing provider details", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          success: false,
          error: {
            code: "AUTH_UNAVAILABLE",
            message: "provider-secret-details",
          },
        },
        { status: 503 },
      ),
    );

    await expect(createAnalysisTarget(input)).rejects.toEqual(
      new AnalysisTargetCreationError(
        "AUTHENTICATION_UNAVAILABLE",
        "Authentication is temporarily unavailable. Please try again later.",
      ),
    );
  });

  it("reports the absent integration endpoint without fabricating a target", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(createAnalysisTarget(input)).rejects.toEqual(
      new AnalysisTargetCreationError(
        "CREATION_UNAVAILABLE",
        "Target creation is temporarily unavailable. Please try again later.",
      ),
    );
  });

  it("maps a persistence failure to a safe creation error", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          success: false,
          error: {
            code: "ANALYSIS_TARGET_CREATION_FAILED",
            message: "We couldn't create this target. Please try again.",
          },
        },
        { status: 500 },
      ),
    );

    await expect(createAnalysisTarget(input)).rejects.toEqual(
      new AnalysisTargetCreationError(
        "CREATION_FAILED",
        "We couldn't create this target. Please try again.",
      ),
    );
  });

  it("rejects malformed successful responses", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ success: true, data: { id: "target-1" } }, { status: 201 }),
    );

    await expect(createAnalysisTarget(input)).rejects.toMatchObject({
      code: "CREATION_FAILED",
      message: "ReviewLens returned an unexpected response. Please try again.",
    });
  });

  it("returns a safe error when the request cannot reach the server", async () => {
    fetchMock.mockRejectedValue(new TypeError("network details"));

    await expect(createAnalysisTarget(input)).rejects.toMatchObject({
      code: "CREATION_UNAVAILABLE",
      message: "We couldn't reach ReviewLens. Check your connection and try again.",
    });
  });
});
