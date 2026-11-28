import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

/**
 * The session client answers the last-successful-attempt read (filtered by status) and, when
 * given, the latest-attempt-kind read (unfiltered). Without `latest`, both get `lastSuccess`.
 * "unreadable" fails only the last-successful-attempt read.
 */
function sessionClient(
  lastSuccess: IngestionAttemptRow | null | "unreadable",
  latest?: IngestionAttemptRow & { attempt_kind: "initial" | "reingest" },
) {
  return {
    from: jest.fn(() => {
      let succeededOnly = false;
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "order", "limit"]) chain[method] = () => chain;
      chain.eq = (column: string, value: unknown) => {
        if (column === "status" && value === "succeeded") succeededOnly = true;
        return chain;
      };
      chain.maybeSingle = async () => {
        const read = succeededOnly || latest === undefined ? lastSuccess : latest;
        return read === "unreadable"
          ? { data: null, error: { message: "synthetic read failure" } }
          : { data: read, error: null };
      };
      return chain;
    }),
  };
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

// ---------------------------------------------------------------------------------------------
// PR #137 review (MP): retrying a failed refresh from the workspace reaches /reingest
// ---------------------------------------------------------------------------------------------
const START_ENDPOINT = "/api/analysis-targets/owned-target/ingestion";
const REINGEST_ENDPOINT = "/api/analysis-targets/owned-target/ingestion/reingest";
const failedSummary = {
  state: "failed",
  startedAt: "2026-11-27T09:00:00Z",
  finishedAt: "2026-11-27T09:00:05Z",
  savedCount: 0,
  skippedCount: 0,
  errorCode: "PROVIDER_REJECTED",
  identityBasis: null,
  providerBusinessName: null,
};
const processingSummary = {
  ...failedSummary,
  state: "processing",
  startedAt: "2026-11-27T09:05:00Z",
  finishedAt: null,
  errorCode: null,
};
function ok(status: number, data: unknown) {
  return { ok: true, status, json: async () => ({ success: true, data }) } as Response;
}
function ingestionPanel() {
  return screen.getByRole("region", { name: "Target ingestion" });
}
function savedList() {
  return screen.getByRole("list", { name: "Saved reviews" });
}
function expectSavedReviewsVisible() {
  expect(within(savedList()).getByText("Previously collected croissant review")).toBeVisible();
  expect(within(savedList()).getByText("Previously collected coffee review")).toBeVisible();
}

it("retries a refresh that failed in this workspace through /reingest, keeping the reviews", async () => {
  jest.mocked(getLatestAttempt).mockResolvedValue(success);
  const fetchMock = jest
    .mocked(global.fetch)
    .mockResolvedValueOnce(ok(200, failedSummary))
    .mockResolvedValueOnce(ok(202, processingSummary));
  render(await ProtectedTargetWorkspace({ params }));
  expectSavedReviewsVisible();

  // 1. A refresh from the workspace fails (the provider rejected it).
  await act(async () =>
    fireEvent.click(within(refreshCard()).getByRole("button", { name: "Refresh reviews" })),
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    REINGEST_ENDPOINT,
    expect.objectContaining({ method: "POST" }),
  );
  expect(within(ingestionPanel()).getByRole("alert")).toHaveTextContent(
    ingestionErrorMessage("PROVIDER_REJECTED"),
  );
  expect(ingestionPanel()).toHaveTextContent(
    "This was a refresh of reviews already collected for this target. They are unchanged and still available. Try again starts a new refresh.",
  );
  expectSavedReviewsVisible();

  // 2. "Try again" in the Ingestion panel starts a NEW refresh, not the create path.
  const retry = within(ingestionPanel()).getByRole("button", { name: "Try again" });
  expect(retry).toBeEnabled();
  await act(async () => fireEvent.click(retry));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenNthCalledWith(2, REINGEST_ENDPOINT, {
    method: "POST",
    signal: expect.any(AbortSignal),
  });
  expect(fetchMock).not.toHaveBeenCalledWith(START_ENDPOINT, expect.anything());

  // 3. The new attempt is processing; the saved reviews and questions stay available.
  expect(
    within(ingestionPanel()).getByText("Collecting reviews for Bakery from Google Maps…"),
  ).toBeInTheDocument();
  expect(within(refreshCard()).getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  expectSavedReviewsVisible();
  expect(screen.getByRole("button", { name: "Ask question" })).toBeEnabled();
});

it("retries a server-recorded failed refresh through /reingest after a reload", async () => {
  jest.mocked(getLatestAttempt).mockResolvedValue(refreshFailed);
  client = sessionClient(success, { ...refreshFailed, attempt_kind: "reingest" });
  jest.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
  const fetchMock = jest.mocked(global.fetch).mockResolvedValueOnce(ok(202, processingSummary));
  render(await ProtectedTargetWorkspace({ params }));

  await act(async () =>
    fireEvent.click(within(ingestionPanel()).getByRole("button", { name: "Try again" })),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(REINGEST_ENDPOINT, {
    method: "POST",
    signal: expect.any(AbortSignal),
  });
  expect(
    within(ingestionPanel()).getByText("Collecting reviews for Bakery from Google Maps…"),
  ).toBeInTheDocument();
  expectSavedReviewsVisible();
});

it("keeps retrying a failed FIRST collection through the original start path", async () => {
  const failedInitial = {
    ...refreshFailed,
    id: "attempt-initial-failed",
    provider_request_id: null,
  };
  jest.mocked(getLatestAttempt).mockResolvedValue(failedInitial);
  client = sessionClient(null, { ...failedInitial, attempt_kind: "initial" });
  jest.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
  listReviews.mockResolvedValue([]);
  const fetchMock = jest.mocked(global.fetch).mockResolvedValueOnce(ok(202, processingSummary));
  render(await ProtectedTargetWorkspace({ params }));
  expect(screen.queryByRole("region", { name: "Refresh reviews" })).not.toBeInTheDocument();
  expect(ingestionPanel()).not.toHaveTextContent("This was a refresh");

  await act(async () =>
    fireEvent.click(within(ingestionPanel()).getByRole("button", { name: "Try again" })),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(START_ENDPOINT, {
    method: "POST",
    signal: expect.any(AbortSignal),
  });
  expect(fetchMock).not.toHaveBeenCalledWith(REINGEST_ENDPOINT, expect.anything());
});

// ---------------------------------------------------------------------------------------------
// PR #137 review (Shawn): the PERSISTED attempt_kind decides the retry route, across reloads
// ---------------------------------------------------------------------------------------------
it.each([
  ["reingest", REINGEST_ENDPOINT, START_ENDPOINT],
  ["initial", START_ENDPOINT, REINGEST_ENDPOINT],
] as const)(
  "routes Try again for a failed attempt recorded as %s from server data, after every reload",
  async (kind, expected, never) => {
    // The baseline read fails, so the recorded attempt_kind is the only signal left: no UI state,
    // and no successful dataset, can pick the route here.
    jest.mocked(getLatestAttempt).mockResolvedValue(refreshFailed);
    client = sessionClient("unreadable", { ...refreshFailed, attempt_kind: kind });
    jest.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const fetchMock = jest.mocked(global.fetch).mockResolvedValue(ok(202, processingSummary));

    // First load, then a full reload (a fresh server render and a fresh client tree).
    for (const load of [1, 2]) {
      const view = render(await ProtectedTargetWorkspace({ params }));
      expectSavedReviewsVisible();
      await act(async () =>
        fireEvent.click(within(ingestionPanel()).getByRole("button", { name: "Try again" })),
      );
      expect(fetchMock).toHaveBeenCalledTimes(load);
      expect(fetchMock).toHaveBeenLastCalledWith(expected, {
        method: "POST",
        signal: expect.any(AbortSignal),
      });
      expect(fetchMock).not.toHaveBeenCalledWith(never, expect.anything());
      expect(
        within(ingestionPanel()).getByText("Collecting reviews for Bakery from Google Maps…"),
      ).toBeInTheDocument();
      expectSavedReviewsVisible();
      view.unmount();
    }
    // The kind was read from the persisted attempt row through the session client.
    expect(client.from).toHaveBeenCalledWith("ingestion_attempts");
  },
);
