import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProtectedTargetWorkspace } from "@/components/analysis-targets/ProtectedTargetWorkspace";
import { requirePageUser } from "@/services/auth/access-control";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOwnedTargetOrThrow } from "@/services/analysis-targets/target-ownership";
import { createSupabaseReviewStore } from "@/services/reviews/supabase-review-store";
import { getLatestAttempt } from "@/services/ingestion/ingestion-attempt-repository";

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
const mockRouter = { bfcacheId: "switch-test", replace: jest.fn(), refresh: jest.fn() };
const fetchMock = jest.fn();
const originalFetch = global.fetch;
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
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
const aggregateReviews = jest.fn();
const isTargetOwnedBy = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock;
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
  jest
    .mocked(createSupabaseReviewStore)
    .mockReturnValue({ listReviews, aggregateReviews, isTargetOwnedBy } as never);
  listReviews.mockResolvedValue([]);
  aggregateReviews.mockReset().mockResolvedValue({ reviewCount: 0, averageRating: null });
  isTargetOwnedBy.mockReset().mockResolvedValue(true);
  jest.mocked(getLatestAttempt).mockResolvedValue(null);
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const A = "target-a",
  B = "target-b",
  A_REVIEW = "a1a1a1a1-0000-4000-8000-000000000001",
  B_REVIEW = "b1b1b1b1-0000-4000-8000-000000000002";
const reviewId = (targetId: string) => (targetId === A ? A_REVIEW : B_REVIEW);
async function tree(id: string) {
  jest.mocked(getOwnedTargetOrThrow).mockResolvedValue({
    id,
    ownerId: "verified-user",
    name: id === A ? "Alpha batteries" : "Beta service",
    platform: "google_maps",
    sourceUrl: "https://www.google.com/maps/place/Test",
    googlePlaceId: null,
    createdAt: "2026-11-01",
  });
  listReviews.mockResolvedValue([
    {
      id: reviewId(id),
      analysisTargetId: id,
      rating: id === A ? 2 : 5,
      text: id === A ? "ALPHA battery life" : "BETA customer service",
      reviewDate: null,
      reviewerName: null,
      sourceMetadata: {},
      createdAt: "2026-11-01",
    },
  ]);
  aggregateReviews.mockResolvedValue({
    reviewCount: id === A ? 3 : 1,
    averageRating: id === A ? 2 : 5,
  });
  jest.mocked(getLatestAttempt).mockResolvedValue({
    status: id === A ? "succeeded" : "failed",
    skipped_count: id === A ? 2 : 0,
    saved_count: id === A ? 3 : 1,
  } as never);
  return ProtectedTargetWorkspace({ params: Promise.resolve({ targetId: id }) });
}
async function submit() {
  fireEvent.change(screen.getByLabelText(/Question/), {
    target: { value: "What do reviewers say?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
}
function response(id: string, text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: { targetId: id, outcome: "answered", answer: text, citedReviewIds: [reviewId(id)] },
    }),
  };
}
it("switches the actual workspace label, review list and question target together", async () => {
  fetchMock.mockResolvedValue(response(A, "A answer"));
  const view = render(await tree(A));
  await submit();
  expect(await screen.findByText("A answer")).toBeInTheDocument();
  view.rerender(await tree(B));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Beta service");
  expect(
    within(screen.getByRole("region", { name: "Review questions" })).getByText(/Active target:/),
  ).toHaveTextContent("Beta service");
  expect(screen.queryByText("A answer")).not.toBeInTheDocument();
  expect(screen.queryByText("ALPHA battery life")).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Question/)).toHaveValue("");
  fetchMock.mockResolvedValue(response(B, "B answer"));
  await submit();
  expect(await screen.findByText("B answer")).toBeInTheDocument();
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/analysis-targets/" + B + "/questions");
  expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1].body)).toEqual({
    question: "What do reviewers say?",
  });
});
it.each(["success", "failure"])(
  "ignores delayed A %s after B finishes even when fetch ignores abort",
  async (kind) => {
    let resolve!: (v: unknown) => void, reject!: (e: Error) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
    );
    const view = render(await tree(A));
    await submit();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    view.rerender(await tree(B));
    expect(signal.aborted).toBe(true);
    fetchMock.mockResolvedValueOnce(response(B, "B current answer"));
    await submit();
    expect(await screen.findByText("B current answer")).toBeInTheDocument();
    await act(async () => {
      if (kind === "success") resolve(response(A, "A stale answer"));
      else reject(new Error("PRIVATE_A_FAILURE"));
    });
    expect(screen.getByText("B current answer")).toBeInTheDocument();
    expect(screen.queryByText("A stale answer")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Review questions" })).queryByRole("alert"),
    ).not.toBeInTheDocument();
  },
);
it("rejects a wrong-target server response after switching", async () => {
  const view = render(await tree(A));
  view.rerender(await tree(B));
  fetchMock.mockResolvedValue(response(A, "PRIVATE_ALPHA_REPLY"));
  await submit();
  expect(
    await within(screen.getByRole("region", { name: "Review questions" })).findByRole("alert"),
  ).toHaveTextContent("unexpected response");
  expect(screen.queryByText("PRIVATE_ALPHA_REPLY")).not.toBeInTheDocument();
});
it("does not resurrect an old A request on A to B to A navigation", async () => {
  let resolve!: (v: unknown) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  const view = render(await tree(A));
  await submit();
  view.rerender(await tree(B));
  view.rerender(await tree(A));
  fetchMock.mockResolvedValueOnce(response(A, "A fresh answer"));
  await submit();
  expect(await screen.findByText("A fresh answer")).toBeInTheDocument();
  await act(async () => resolve(response(A, "A obsolete answer")));
  expect(screen.queryByText("A obsolete answer")).not.toBeInTheDocument();
  expect(screen.getByText("A fresh answer")).toBeInTheDocument();
});

function summaryMetric(label: string) {
  const card = screen
    .getByRole("heading", { name: "Review summary" })
    .closest("[aria-labelledby]")!;
  return within(card as HTMLElement).getByText(label).nextElementSibling;
}
function expectSummary(count: string, average: string, status: string, skipped: string) {
  expect(summaryMetric("Reviews saved")).toHaveTextContent(new RegExp("^" + count + "$"));
  expect(summaryMetric("Average rating")).toHaveTextContent(average);
  expect(summaryMetric("Ingestion status")).toHaveTextContent(status);
  expect(summaryMetric("Skipped records")).toHaveTextContent(new RegExp("^" + skipped + "$"));
}
it("switches persisted summary metrics and status with the real workspace and summary service A to B to A", async () => {
  const view = render(await tree(A));
  expectSummary("3", "2.0 / 5", "Partially ingested", "2");
  view.rerender(await tree(B));
  expectSummary("1", "5.0 / 5", "Failed", "0");
  expect(aggregateReviews).toHaveBeenLastCalledWith(B);
  expect(isTargetOwnedBy).toHaveBeenLastCalledWith(B, "verified-user");
  expect(screen.getByRole("button", { name: "Ask question" })).toBeEnabled();
  view.rerender(await tree(A));
  expectSummary("3", "2.0 / 5", "Partially ingested", "2");
  expect(aggregateReviews.mock.calls.map(([id]) => id)).toEqual([A, B, A]);
});
it("recomputes summary from newly persisted metrics on a refreshed B workspace", async () => {
  const view = render(await tree(A));
  view.rerender(await tree(B));
  expectSummary("1", "5.0 / 5", "Failed", "0");
  aggregateReviews.mockResolvedValue({ reviewCount: 4, averageRating: 3.25 });
  jest
    .mocked(getLatestAttempt)
    .mockResolvedValue({ status: "succeeded", skipped_count: 1, saved_count: 4 } as never);
  view.rerender(await ProtectedTargetWorkspace({ params: Promise.resolve({ targetId: B }) }));
  expectSummary("4", "3.3 / 5", "Partially ingested", "1");
  expect(aggregateReviews).toHaveBeenLastCalledWith(B);
});
it("replaces A summary with a safe B failure rather than stale or zero-valued metrics", async () => {
  const view = render(await tree(A));
  await tree(B);
  aggregateReviews.mockRejectedValue(new Error("PRIVATE_ALPHA_SUMMARY_FAILURE"));
  view.rerender(await ProtectedTargetWorkspace({ params: Promise.resolve({ targetId: B }) }));
  expect(screen.queryByText("Reviews saved")).not.toBeInTheDocument();
  expect(
    screen.getByText("We couldn't load the review summary. Please try again."),
  ).toHaveAttribute("role", "alert");
  expect(document.body.textContent).not.toContain("PRIVATE_ALPHA_SUMMARY_FAILURE");
  expect(screen.getByText("BETA customer service")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ask question" })).toBeEnabled();
});
it("shows empty B summary and disables Q&A after leaving populated A", async () => {
  const view = render(await tree(A));
  await tree(B);
  listReviews.mockResolvedValue([]);
  aggregateReviews.mockResolvedValue({ reviewCount: 0, averageRating: null });
  view.rerender(await ProtectedTargetWorkspace({ params: Promise.resolve({ targetId: B }) }));
  expectSummary("0", "No ratings yet", "Failed", "0");
  expect(screen.queryByText("ALPHA battery life")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ask question" })).toBeDisabled();
});
