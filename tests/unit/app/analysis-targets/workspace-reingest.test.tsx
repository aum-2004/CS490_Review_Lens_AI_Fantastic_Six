import { render, screen, within } from "@testing-library/react";
import { ProtectedTargetWorkspace } from "@/components/analysis-targets/ProtectedTargetWorkspace";
import { ReviewQuestions } from "@/components/reviews/ReviewQuestions";
import { requirePageUser } from "@/services/auth/access-control";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOwnedTargetOrThrow } from "@/services/analysis-targets/target-ownership";
import { listAnalysisTargets } from "@/services/analysis-targets/list-analysis-targets";
import { createSupabaseReviewStore } from "@/services/reviews/supabase-review-store";
import { getReviewSummary } from "@/services/reviews/review-summary";
import { ingestionEnabled, ingestionStorageApproved } from "@/services/ingestion/ingestion-runtime";
import { ingestionRecoveryConfigured } from "@/services/ingestion/ingestion-recovery";
import { ingestionErrorMessage } from "@/services/ingestion/ingestion-state";
import {
  getLatestAttempt,
  type IngestionAttemptRow,
} from "@/services/ingestion/ingestion-attempt-repository";

// S3-009: a running or failed refresh never hides or disables the previously saved dataset.
jest.mock("@/services/auth/access-control", () => ({ requirePageUser: jest.fn() }));
jest.mock("@/components/reviews/ReviewQuestions", () => {
  const actual = jest.requireActual("@/components/reviews/ReviewQuestions");
  return { ...actual, ReviewQuestions: jest.fn(actual.ReviewQuestions) };
});
jest.mock("@/services/analysis-targets/list-analysis-targets", () => ({
  listAnalysisTargets: jest.fn(),
}));
jest.mock("@/services/ingestion/ingestion-recovery", () => ({
  ingestionRecoveryConfigured: jest.fn(),
}));
jest.mock("@/services/ingestion/ingestion-attempt-repository", () => ({
  ...jest.requireActual("@/services/ingestion/ingestion-attempt-repository"),
  getLatestAttempt: jest.fn(),
}));
jest.mock("@/services/ingestion/ingestion-runtime", () => ({
  ingestionEnabled: jest.fn(),
  ingestionStorageApproved: jest.fn(),
}));
const mockRouter = { replace: jest.fn(), refresh: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/analysis-targets/target-ownership", () => ({
  ...jest.requireActual("@/services/analysis-targets/target-ownership"),
  getOwnedTargetOrThrow: jest.fn(),
}));
jest.mock("@/services/reviews/supabase-review-store", () => ({
  createSupabaseReviewStore: jest.fn(),
}));
jest.mock("@/services/reviews/review-summary", () => ({ getReviewSummary: jest.fn() }));
jest.mock("@/components/shared/AccountMenu", () => ({ AccountMenu: () => <span>Account</span> }));
jest.mock("@/components/analysis-targets/RetryTargetsButton", () => ({
  RetryTargetsButton: () => <button>Try again</button>,
}));

const params = Promise.resolve({ targetId: "owned-target" });
const listReviews = jest.fn();
const savedReviews = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    analysisTargetId: "owned-target",
    rating: 4,
    text: "Previously collected croissant review",
    reviewerName: null,
    reviewDate: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    analysisTargetId: "owned-target",
    rating: 5,
    text: "Previously collected coffee review",
    reviewerName: null,
    reviewDate: null,
  },
];
const success: IngestionAttemptRow = {
  id: "attempt-initial",
  analysis_target_id: "owned-target",
  owner_id: "verified-user",
  source_url: "https://www.google.com/maps/place/Bakery",
  submitted_query: "ChIJSynthetic",
  query_kind: "place_id",
  expected_place_id: "ChIJSynthetic",
  provider_request_id: "synthetic-job",
  status: "succeeded",
  started_at: "2026-11-20T12:00:00Z",
  finished_at: "2026-11-20T12:01:00Z",
  saved_count: 2,
  skipped_count: 0,
  error_code: null,
  identity_basis: "expected_place_id",
  verified_identity: { placeId: "ChIJSynthetic", businessName: "Bakery" },
};
const refreshRunning: IngestionAttemptRow = {
  ...success,
  id: "attempt-refresh",
  provider_request_id: "synthetic-refresh-job",
  status: "processing",
  started_at: "2026-11-27T09:00:00Z",
  finished_at: null,
  saved_count: 0,
  identity_basis: null,
  verified_identity: null,
};
const refreshFailed: IngestionAttemptRow = {
  ...refreshRunning,
  status: "failed",
  finished_at: "2026-11-27T09:01:00Z",
  error_code: "NO_REVIEWS",
};

/** The session client answers only the last-successful-attempt read. */
function sessionClient(lastSuccess: IngestionAttemptRow | null) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) chain[method] = () => chain;
  chain.maybeSingle = async () => ({ data: lastSuccess, error: null });
  return { from: jest.fn(() => chain) };
}

let client: ReturnType<typeof sessionClient>;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(ingestionEnabled).mockReturnValue(true);
  jest.mocked(ingestionStorageApproved).mockReturnValue(true);
  jest.mocked(ingestionRecoveryConfigured).mockReturnValue(true);
  global.fetch = jest.fn();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(requirePageUser).mockResolvedValue({ id: "verified-user", email: null });
  client = sessionClient(success);
  jest.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
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
  listReviews.mockResolvedValue(savedReviews);
  jest.mocked(listAnalysisTargets).mockResolvedValue([]);
  jest.mocked(getReviewSummary).mockResolvedValue({
    targetId: "owned-target",
    reviewCount: 2,
    averageRating: 4.5,
    ingestionStatus: "succeeded",
    skippedCount: 0,
  });
});
afterEach(() => jest.restoreAllMocks());

function refreshCard() {
  return screen.getByRole("region", { name: "Refresh reviews" });
}

it.each([
  ["running", refreshRunning],
  ["failed", refreshFailed],
])("keeps the saved reviews browsable and questionable while a refresh is %s", async (_s, row) => {
  jest.mocked(getLatestAttempt).mockResolvedValue(row);
  render(await ProtectedTargetWorkspace({ params }));

  const list = screen.getByRole("list", { name: "Saved reviews" });
  expect(within(list).getByText("Previously collected croissant review")).toBeInTheDocument();
  expect(within(list).getByText("Previously collected coffee review")).toBeInTheDocument();
  const questions = jest.mocked(ReviewQuestions).mock.calls.at(-1)![0];
  expect(questions.reviewsAvailable).toBe(true);
  expect(questions.reviews).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Ask question" })).toBeEnabled();

  // The baseline is the previous successful attempt, read through the RLS session client.
  expect(client.from).toHaveBeenCalledWith("ingestion_attempts");
  expect(refreshCard()).toHaveTextContent("Current dataset: 2 reviews.");
  expect(refreshCard()).toHaveTextContent("2026-11-20 12:01:00 UTC");
});

it("shows the refresh as processing without touching the dataset", async () => {
  jest.mocked(getLatestAttempt).mockResolvedValue(refreshRunning);
  render(await ProtectedTargetWorkspace({ params }));
  expect(within(refreshCard()).getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  expect(within(refreshCard()).getByRole("status")).toHaveTextContent(
    "The 2 reviews already collected stay available for browsing and questions.",
  );
});

it("explains a failed refresh as leaving the previous reviews unchanged", async () => {
  jest.mocked(getLatestAttempt).mockResolvedValue(refreshFailed);
  render(await ProtectedTargetWorkspace({ params }));
  expect(within(refreshCard()).getByRole("alert")).toHaveTextContent(
    `The last refresh didn't finish. ${ingestionErrorMessage("NO_REVIEWS")} Your previously collected reviews are unchanged.`,
  );
  expect(within(refreshCard()).getByRole("button", { name: "Retry refresh" })).toBeEnabled();
});

it("uses a succeeded latest attempt as the baseline without another read", async () => {
  jest.mocked(getLatestAttempt).mockResolvedValue(success);
  render(await ProtectedTargetWorkspace({ params }));
  expect(client.from).not.toHaveBeenCalled();
  expect(within(refreshCard()).getByRole("button", { name: "Refresh reviews" })).toBeEnabled();
  expect(refreshCard()).toHaveTextContent("New reviews it added2 reviews");
});

it("offers no refresh before the first collection succeeds", async () => {
  jest.mocked(getLatestAttempt).mockResolvedValue(null);
  listReviews.mockResolvedValue([]);
  render(await ProtectedTargetWorkspace({ params }));
  expect(screen.queryByRole("region", { name: "Refresh reviews" })).not.toBeInTheDocument();
});

it("keeps the control disabled when the baseline read fails", async () => {
  jest.mocked(getLatestAttempt).mockResolvedValue(refreshFailed);
  jest.mocked(createSupabaseServerClient).mockResolvedValue({
    from: () => {
      throw new Error("private");
    },
  } as never);
  render(await ProtectedTargetWorkspace({ params }));
  // Without a baseline it cannot tell a failed refresh from a failed first collection.
  expect(within(refreshCard()).getByRole("button", { name: "Refresh reviews" })).toBeDisabled();
  expect(within(refreshCard()).queryByRole("alert")).not.toBeInTheDocument();
  expect(refreshCard()).toHaveTextContent("We couldn't load the refresh details");
  expect(screen.getByRole("list", { name: "Saved reviews" })).toBeInTheDocument();
});
