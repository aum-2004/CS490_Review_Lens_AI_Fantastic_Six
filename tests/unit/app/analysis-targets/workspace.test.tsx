import { render, screen } from "@testing-library/react";
import { ProtectedTargetWorkspace } from "@/components/analysis-targets/ProtectedTargetWorkspace";
import { requirePageUser } from "@/services/auth/access-control";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { createSupabaseReviewStore } from "@/services/reviews/supabase-review-store";
import {
  getLatestAttempt,
  type IngestionAttemptRow,
} from "@/services/ingestion/ingestion-attempt-repository";

jest.mock("@/services/auth/access-control", () => ({ requirePageUser: jest.fn() }));
jest.mock("@/services/ingestion/ingestion-recovery", () => ({
  ingestionRecoveryConfigured: () => true,
}));
jest.mock("@/services/ingestion/ingestion-attempt-repository", () => ({
  ...jest.requireActual("@/services/ingestion/ingestion-attempt-repository"),
  getLatestAttempt: jest.fn(),
}));
jest.mock("@/services/ingestion/ingestion-runtime", () => ({
  ingestionEnabled: () => true,
  ingestionStorageApproved: () => true,
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/analysis-targets/target-ownership", () => ({
  ...jest.requireActual("@/services/analysis-targets/target-ownership"),
  getOwnedTargetOrThrow: jest.fn(),
}));
jest.mock("@/services/reviews/supabase-review-store", () => ({
  createSupabaseReviewStore: jest.fn(),
}));
jest.mock("@/components/shared/AccountMenu", () => ({ AccountMenu: () => <span>Account</span> }));
jest.mock("@/components/analysis-targets/RetryTargetsButton", () => ({
  RetryTargetsButton: () => <button>Try again</button>,
}));

const listReviews = jest.fn();
const params = Promise.resolve({ targetId: "owned-target" });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(requirePageUser).mockResolvedValue({ id: "verified-user", email: null });
  jest.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
  jest.mocked(getOwnedTargetOrThrow).mockResolvedValue({
    id: "owned-target",
    ownerId: "verified-user",
    name: "Bakery",
    platform: "google_maps",
    sourceUrl: "https://www.google.com/maps/place/Bakery",
    googlePlaceId: "ChIJSynthetic",
    createdAt: "2026-11-01T00:00:00Z",
  });
  jest.mocked(createSupabaseReviewStore).mockReturnValue({ listReviews } as never);
  listReviews.mockResolvedValue([]);
  jest.mocked(getLatestAttempt).mockResolvedValue(null);
});

afterEach(() => jest.restoreAllMocks());

const persistedAttempt: IngestionAttemptRow = {
  id: "attempt-a",
  analysis_target_id: "owned-target",
  owner_id: "verified-user",
  source_url: "https://www.google.com/maps/place/Bakery",
  submitted_query: "ChIJSynthetic",
  query_kind: "place_id",
  expected_place_id: "ChIJSynthetic",
  provider_request_id: "synthetic-job",
  status: "succeeded",
  started_at: "2026-11-01T12:00:00Z",
  finished_at: "2026-11-01T12:01:00Z",
  saved_count: 1,
  skipped_count: 0,
  error_code: null,
  identity_basis: "expected_place_id",
  verified_identity: null,
};

it.each([
  ["succeeded", 0, "Ingested"],
  ["succeeded", 2, "Partially ingested"],
  ["failed", 2, "Failed"],
  ["processing", 0, "Ingesting"],
] as const)(
  "renders persisted %s status with %i skipped records",
  async (status, skipped, label) => {
    jest.mocked(getLatestAttempt).mockResolvedValue({
      ...persistedAttempt,
      status,
      skipped_count: skipped,
      saved_count: status === "succeeded" ? 1 : 0,
      error_code: status === "failed" ? "PROVIDER_QUOTA" : null,
      finished_at: status === "processing" ? null : persistedAttempt.finished_at,
    });
    render(await ProtectedTargetWorkspace({ params }));
    expect(getLatestAttempt).toHaveBeenCalledWith({}, "verified-user", "owned-target");
    expect(screen.getAllByText(label, { exact: true })).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bakery");
    // Empty review rows do not override the persisted operation result.
    expect(screen.getByText(/No saved reviews yet/)).toBeInTheDocument();
  },
);

it.each(["failed", null] as const)(
  "does not mistake existing review rows for success when the persisted attempt is %s",
  async (status) => {
    jest
      .mocked(getLatestAttempt)
      .mockResolvedValue(
        status
          ? { ...persistedAttempt, status, saved_count: 0, error_code: "PROVIDER_QUOTA" }
          : null,
      );
    listReviews.mockResolvedValue([
      {
        id: "review-a",
        analysisTargetId: "owned-target",
        rating: 4,
        text: "Previously saved bakery review",
        reviewerName: null,
        reviewDate: null,
      },
    ]);
    render(await ProtectedTargetWorkspace({ params }));
    expect(screen.getByText("Previously saved bakery review")).toBeInTheDocument();
    expect(screen.getAllByText(status ? "Failed" : "Not ingested")).toHaveLength(2);
    expect(screen.queryByText("Ingested", { exact: true })).not.toBeInTheDocument();
  },
);

it("opens an owned target with the shared shell, context, empty reviews and ingestion path", async () => {
  render(await ProtectedTargetWorkspace({ params }));
  expect(requirePageUser).toHaveBeenCalledWith("/analysis-targets/owned-target");
  expect(getOwnedTargetOrThrow).toHaveBeenCalledWith({}, "owned-target", "verified-user");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bakery");
  expect(screen.getByText("Google Maps", { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start ingestion" })).toBeEnabled();
  expect(screen.getByText(/No saved reviews yet/)).toBeInTheDocument();
  expect(screen.getAllByText("Not ingested")).toHaveLength(2);
  expect(screen.queryByText("Ingested", { exact: true })).not.toBeInTheDocument();
});

it("never labels unavailable status as no ingestion", async () => {
  jest.mocked(getLatestAttempt).mockRejectedValue(new Error("status database unavailable"));
  render(await ProtectedTargetWorkspace({ params }));
  expect(screen.queryByText("Not ingested")).not.toBeInTheDocument();
  expect(screen.getAllByText("Status unavailable")).toHaveLength(2);
});
it("shows the creation confirmation only after verifying the owned target", async () => {
  render(
    await ProtectedTargetWorkspace({ params, searchParams: Promise.resolve({ created: "1" }) }),
  );
  expect(screen.getByText("Target created. You can now start ingestion.")).toHaveAttribute(
    "class",
    "max-w-prose",
  );
  expect(getOwnedTargetOrThrow).toHaveBeenCalled();
});
it("does not let a creation marker disclose an unavailable target", async () => {
  jest.mocked(getOwnedTargetOrThrow).mockRejectedValue(new TargetNotFoundError());
  render(
    await ProtectedTargetWorkspace({ params, searchParams: Promise.resolve({ created: "1" }) }),
  );
  expect(
    screen.queryByText("Target created. You can now start ingestion."),
  ).not.toBeInTheDocument();
  expect(listReviews).not.toHaveBeenCalled();
  expect(getLatestAttempt).not.toHaveBeenCalled();
});

it("does not query protected data when authentication redirects", async () => {
  jest.mocked(requirePageUser).mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(ProtectedTargetWorkspace({ params })).rejects.toThrow("NEXT_REDIRECT");
  expect(createSupabaseServerClient).not.toHaveBeenCalled();
  expect(listReviews).not.toHaveBeenCalled();
});

it("denies unavailable targets before accessing reviews or rendering ingestion", async () => {
  jest.mocked(getOwnedTargetOrThrow).mockRejectedValue(new TargetNotFoundError());
  render(await ProtectedTargetWorkspace({ params }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "This target isn't available to your account",
  );
  expect(listReviews).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Start ingestion" })).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("Bakery");
});

it("keeps target context when reviews fail and does not misrepresent failure as an empty dataset", async () => {
  listReviews.mockRejectedValue(new Error("private SQL"));
  render(await ProtectedTargetWorkspace({ params }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bakery");
  expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load the saved reviews");
  expect(screen.queryByText(/No saved reviews yet/)).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("private SQL");
});

it("handles a target lookup failure safely with retry", async () => {
  jest.mocked(getOwnedTargetOrThrow).mockRejectedValue(new Error("private DB credentials"));
  render(await ProtectedTargetWorkspace({ params }));
  expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load this target");
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(listReviews).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain("private DB");
});
