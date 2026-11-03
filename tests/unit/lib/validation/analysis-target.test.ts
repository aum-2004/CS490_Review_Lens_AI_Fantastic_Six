/** @jest-environment node */

import {
  SUPPORTED_REVIEW_PLATFORM,
  validateAnalysisTargetInput,
  type AnalysisTargetValidationErrorCode,
  type AnalysisTargetValidationResult,
} from "@/lib/validation/analysis-target";

const validSourceUrl = "https://www.google.com/maps/place/NJIT/@40.742,-74.179,17z";

function expectFailure(
  result: AnalysisTargetValidationResult,
  expectedIssues: Array<{
    field?: "name" | "sourceUrl";
    code: AnalysisTargetValidationErrorCode;
    message: string;
  }>,
) {
  expect(result).toEqual({
    success: false,
    error: {
      code: "INVALID_ANALYSIS_TARGET_INPUT",
      message: "Please fix the highlighted fields.",
      issues: expectedIssues,
    },
  });
}

describe("validateAnalysisTargetInput", () => {
  describe("input shape", () => {
    it.each([undefined, null, "target", 42, true, []])(
      "rejects a non-object input: %p",
      (input) => {
        expectFailure(validateAnalysisTargetInput(input), [
          {
            code: "INVALID_INPUT_TYPE",
            message: "Target information must be an object.",
          },
        ]);
      },
    );

    it("reports missing fields in deterministic field order", () => {
      expectFailure(validateAnalysisTargetInput({}), [
        {
          field: "name",
          code: "TARGET_NAME_REQUIRED",
          message: "Enter a name for this target.",
        },
        {
          field: "sourceUrl",
          code: "SOURCE_URL_REQUIRED",
          message: "Enter the Google Maps link for this target.",
        },
      ]);
    });

    it("does not accept inherited input fields", () => {
      const input = Object.create({ name: "NJIT", sourceUrl: validSourceUrl });

      expectFailure(validateAnalysisTargetInput(input), [
        {
          field: "name",
          code: "TARGET_NAME_REQUIRED",
          message: "Enter a name for this target.",
        },
        {
          field: "sourceUrl",
          code: "SOURCE_URL_REQUIRED",
          message: "Enter the Google Maps link for this target.",
        },
      ]);
    });
  });

  describe("target name", () => {
    it.each([
      ["missing", undefined, "TARGET_NAME_REQUIRED"],
      ["null", null, "TARGET_NAME_REQUIRED"],
      ["empty", "", "TARGET_NAME_REQUIRED"],
      ["whitespace-only", " \t\n ", "TARGET_NAME_REQUIRED"],
      ["number", 123, "TARGET_NAME_INVALID_TYPE"],
      ["array", ["NJIT"], "TARGET_NAME_INVALID_TYPE"],
      ["object", { value: "NJIT" }, "TARGET_NAME_INVALID_TYPE"],
    ] as const)("rejects a %s name", (_description, name, code) => {
      const input =
        name === undefined ? { sourceUrl: validSourceUrl } : { name, sourceUrl: validSourceUrl };

      expectFailure(validateAnalysisTargetInput(input), [
        {
          field: "name",
          code,
          message: "Enter a name for this target.",
        },
      ]);
    });

    it("accepts the 120-character boundary after trimming", () => {
      const name = "a".repeat(120);

      expect(
        validateAnalysisTargetInput({ name: `  ${name}  `, sourceUrl: validSourceUrl }),
      ).toEqual({
        success: true,
        data: {
          name,
          sourceUrl: validSourceUrl,
          platform: SUPPORTED_REVIEW_PLATFORM,
        },
      });
    });

    it("rejects a name longer than 120 characters after trimming", () => {
      expectFailure(
        validateAnalysisTargetInput({ name: ` ${"a".repeat(121)} `, sourceUrl: validSourceUrl }),
        [
          {
            field: "name",
            code: "TARGET_NAME_TOO_LONG",
            message: "Target names can be up to 120 characters.",
          },
        ],
      );
    });

    it("counts Unicode code points for the name boundary", () => {
      expect(
        validateAnalysisTargetInput({ name: "😀".repeat(120), sourceUrl: validSourceUrl }).success,
      ).toBe(true);
      expectFailure(
        validateAnalysisTargetInput({ name: "😀".repeat(121), sourceUrl: validSourceUrl }),
        [
          {
            field: "name",
            code: "TARGET_NAME_TOO_LONG",
            message: "Target names can be up to 120 characters.",
          },
        ],
      );
    });
  });

  describe("source URL", () => {
    it.each([
      ["missing", undefined, "SOURCE_URL_REQUIRED", "Enter the Google Maps link for this target."],
      ["null", null, "SOURCE_URL_REQUIRED", "Enter the Google Maps link for this target."],
      ["empty", "", "SOURCE_URL_REQUIRED", "Enter the Google Maps link for this target."],
      [
        "whitespace-only",
        " \t\n ",
        "SOURCE_URL_REQUIRED",
        "Enter the Google Maps link for this target.",
      ],
      [
        "number",
        123,
        "SOURCE_URL_INVALID_TYPE",
        "That doesn't look like a valid web address. Paste the full link, starting with https://.",
      ],
      [
        "array",
        [validSourceUrl],
        "SOURCE_URL_INVALID_TYPE",
        "That doesn't look like a valid web address. Paste the full link, starting with https://.",
      ],
      [
        "object",
        { url: validSourceUrl },
        "SOURCE_URL_INVALID_TYPE",
        "That doesn't look like a valid web address. Paste the full link, starting with https://.",
      ],
    ] as const)("rejects a %s source URL", (_description, sourceUrl, code, message) => {
      const input = sourceUrl === undefined ? { name: "NJIT" } : { name: "NJIT", sourceUrl };

      expectFailure(validateAnalysisTargetInput(input), [{ field: "sourceUrl", code, message }]);
    });

    it.each(["not a URL", "/maps/place/NJIT", "www.google.com/maps/place/NJIT", "https://"])(
      "rejects malformed or relative input: %s",
      (sourceUrl) => {
        expectFailure(validateAnalysisTargetInput({ name: "NJIT", sourceUrl }), [
          {
            field: "sourceUrl",
            code: "SOURCE_URL_MALFORMED",
            message:
              "That doesn't look like a valid web address. Paste the full link, starting with https://.",
          },
        ]);
      },
    );

    it.each([
      "ftp://www.google.com/maps/place/NJIT",
      "file://www.google.com/maps/place/NJIT",
      "javascript://www.google.com/maps/place/NJIT",
    ])("rejects an unsupported protocol: %s", (sourceUrl) => {
      expectFailure(validateAnalysisTargetInput({ name: "NJIT", sourceUrl }), [
        {
          field: "sourceUrl",
          code: "SOURCE_URL_UNSUPPORTED_PROTOCOL",
          message:
            "That doesn't look like a valid web address. Paste the full link, starting with https://.",
        },
      ]);
    });

    it.each([
      "https://www.google.com/maps/place/NJIT/@40.742,-74.179,17z",
      "http://google.com/maps/place/Example+Business",
      "https://maps.google.com/maps?cid=123456789",
      "https://www.google.com/maps?place_id=ChIJ123456789",
      "https://www.google.com/maps/search/?api=1&query=NJIT&query_place_id=abc123",
      "https://maps.google.com/?cid=123456789",
    ])("accepts a canonical Google Maps business URL: %s", (sourceUrl) => {
      expect(validateAnalysisTargetInput({ name: "NJIT", sourceUrl })).toEqual({
        success: true,
        data: {
          name: "NJIT",
          sourceUrl,
          platform: "google_maps",
        },
      });
    });

    it.each([
      "https://example.com/maps/place/NJIT",
      "https://google.com.evil.example/maps/place/NJIT",
      "https://maps.google.com.evil.example/maps/place/NJIT",
      "https://evilgoogle.com/maps/place/NJIT",
      "https://www.g00gle.com/maps/place/NJIT",
      "https://maps.app.goo.gl/abc123",
      "https://example.com/?next=https://www.google.com/maps/place/NJIT",
      "https://www.google.com/search?q=NJIT",
      "https://google.com/?cid=123456789",
      "https://www.google.com/maps",
      "https://www.google.com/maps/place/",
      "https://www.google.com/maps/place//",
      "https://www.google.com/maps/place/%20",
      "https://www.google.com/maps/place///",
      "https://www.google.com/maps/search/?query=",
      "https://maps.google.com/?q=pizza",
      "https://www.google.com/maps/search/?query=restaurants",
      "https://maps.google.com/",
      "https://www.google.com:8443/maps/place/NJIT",
    ])("rejects an unsupported or non-business URL: %s", (sourceUrl) => {
      expectFailure(validateAnalysisTargetInput({ name: "NJIT", sourceUrl }), [
        {
          field: "sourceUrl",
          code: "SOURCE_URL_UNSUPPORTED_PLATFORM",
          message:
            "This link isn't a Google Maps link. Open the business in Google Maps and copy its link.",
        },
      ]);
    });

    it.each([
      "https://user@www.google.com/maps/place/NJIT",
      "https://user:password@www.google.com/maps/place/NJIT",
      "https://www.google.com@evil.example/maps/place/NJIT",
    ])("rejects a URL containing user information: %s", (sourceUrl) => {
      expectFailure(validateAnalysisTargetInput({ name: "NJIT", sourceUrl }), [
        {
          field: "sourceUrl",
          code: "SOURCE_URL_UNSUPPORTED_PLATFORM",
          message:
            "This link isn't a Google Maps link. Open the business in Google Maps and copy its link.",
        },
      ]);
    });
  });

  describe("normalized result contract", () => {
    it("trims valid fields while preserving the usable source URL", () => {
      expect(
        validateAnalysisTargetInput({
          name: "  New Jersey Institute of Technology  ",
          sourceUrl: `  ${validSourceUrl}  `,
        }),
      ).toEqual({
        success: true,
        data: {
          name: "New Jersey Institute of Technology",
          sourceUrl: validSourceUrl,
          platform: "google_maps",
        },
      });
    });

    it("returns only allowlisted fields and fixes the platform", () => {
      const result = validateAnalysisTargetInput({
        name: "NJIT",
        sourceUrl: validSourceUrl,
        platform: "untrusted_platform",
        ownerId: "attacker-owner",
        userId: "attacker-user",
        arbitrary: "untrusted",
      });

      expect(result).toEqual({
        success: true,
        data: {
          name: "NJIT",
          sourceUrl: validSourceUrl,
          platform: "google_maps",
        },
      });
      expect(JSON.stringify(result)).not.toContain("attacker");
      expect(JSON.stringify(result)).not.toContain("arbitrary");
    });

    it("returns at most one issue per field in name-then-URL order", () => {
      const result = validateAnalysisTargetInput({ name: " ", sourceUrl: "not a URL" });

      expectFailure(result, [
        {
          field: "name",
          code: "TARGET_NAME_REQUIRED",
          message: "Enter a name for this target.",
        },
        {
          field: "sourceUrl",
          code: "SOURCE_URL_MALFORMED",
          message:
            "That doesn't look like a valid web address. Paste the full link, starting with https://.",
        },
      ]);
    });

    it("returns the same result for repeated validation", () => {
      const input = { name: " ", sourceUrl: "https://google.com/search?q=NJIT" };

      expect(validateAnalysisTargetInput(input)).toEqual(validateAnalysisTargetInput(input));
    });
  });
});
