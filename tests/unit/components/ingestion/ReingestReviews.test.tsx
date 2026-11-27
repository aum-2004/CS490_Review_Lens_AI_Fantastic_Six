import { useEffect } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ReingestReviews } from "@/components/ingestion/ReingestReviews";
import {
  WorkspaceIngestionProvider,
  useWorkspaceIngestion,
} from "@/components/ingestion/WorkspaceIngestionState";
import { ingestionErrorMessage, type IngestionSummary } from "@/services/ingestion/ingestion-state";
import { reingestErrorMessage } from "@/services/ingestion/ingestion-reingest-state";

const mockRouter = { replace: jest.fn(), refresh: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const fetchMock = jest.fn();
const TARGET_ID = "33333333-3333-4333-8333-333333333333";
const ENDPOINT = `/api/analysis-targets/${TARGET_ID}/ingestion/reingest`;

const succeeded: IngestionSummary = {
  state: "succeeded",
  startedAt: "2026-11-20T12:00:00Z",
  finishedAt: "2026-11-20T12:01:00Z",
  savedCount: 3,
  skippedCount: 0,
  errorCode: null,
  identityBasis: "expected_place_id",
  providerBusinessName: "Bakery",
};
const processing: IngestionSummary = {
  ...succeeded,
  state: "processing",
  startedAt: "2026-11-27T09:00:00Z",
  finishedAt: null,
  savedCount: 0,
  identityBasis: null,
  providerBusinessName: null,
};
const baseline = { finishedAt: "2026-11-20T12:01:00Z", savedCount: 3 };

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** Lets a test play the Ingestion panel's poller, which updates the shared summary. */
const summaryHandle: { set?: (summary: IngestionSummary) => void } = {};
function SummaryHandle() {
  const { setSummary } = useWorkspaceIngestion();
  useEffect(() => {
    summaryHandle.set = setSummary;
  }, [setSummary]);
  return null;
}

function renderControl(
  options: {
    summary?: IngestionSummary | null;
    reviewCount?: number | null;
    base?: typeof baseline | null | undefined;
    unavailableReason?: string | null;
    targetName?: string;
  } = {},
) {
  // An explicit undefined means "baseline failed to load", so test key presence, not the value.
  const base = "base" in options ? options.base : baseline;
  const {
    summary = succeeded,
    reviewCount = 3,
    unavailableReason = null,
    targetName = "Bakery",
  } = options;
  return render(
    <WorkspaceIngestionProvider initialSummary={summary}>
      <SummaryHandle />
      <ReingestReviews
        targetId={TARGET_ID}
        targetName={targetName}
        reviewCount={reviewCount}
        baseline={base}
        unavailableReason={unavailableReason}
      />
    </WorkspaceIngestionProvider>,
  );
}

function card() {
  return screen.getByRole("region", { name: "Refresh reviews" });
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
});

it("describes the current dataset as the deduplicated union of reviews collected so far", () => {
  renderControl();
  const region = card();
  expect(region).toHaveTextContent("Current dataset: 3 reviews.");
  expect(region).toHaveTextContent(
    "It is the deduplicated union of every review collected for Bakery so far.",
  );
  expect(region).toHaveTextContent(
    /Reviews already collected stay in the dataset even when a later response doesn't include them/,
  );
  expect(within(region).getByText("2026-11-20 12:01:00 UTC")).toHaveAttribute(
    "datetime",
    "2026-11-20T12:01:00Z",
  );
  expect(region).toHaveTextContent("New reviews it added3 reviews");
  const button = within(region).getByRole("button", { name: "Refresh reviews" });
  expect(button).toBeEnabled();
  expect(button).toHaveAccessibleDescription(/merges them in/);
});

it("is a native, keyboard-focusable button", () => {
  renderControl();
  const button = within(card()).getByRole("button", { name: "Refresh reviews" });
  expect(button.tagName).toBe("BUTTON");
  button.focus();
  expect(button).toHaveFocus();
});

it("starts one refresh, shows processing, and keeps describing existing reviews as available", async () => {
  let resolve!: (response: Response) => void;
  fetchMock.mockReturnValue(new Promise<Response>((done) => (resolve = done)));
  renderControl();
  const button = within(card()).getByRole("button", { name: "Refresh reviews" });

  fireEvent.click(button);
  fireEvent.click(button);
  fireEvent.click(button);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  expect(within(card()).getByRole("button", { name: "Starting refresh…" })).toBeDisabled();

  await act(async () => resolve(jsonResponse(202, { success: true, data: processing })));

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(within(card()).getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  expect(within(card()).getByRole("status")).toHaveTextContent(
    "Refreshing reviews for Bakery… The 3 reviews already collected stay available for browsing and questions.",
  );
  // The Ingestion panel polls a running attempt and refreshes the page when it finishes.
  expect(mockRouter.refresh).not.toHaveBeenCalled();
});

it("reports success when the refresh it started completes", async () => {
  fetchMock.mockResolvedValue(jsonResponse(202, { success: true, data: processing }));
  renderControl();
  await act(async () =>
    fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" })),
  );
  expect(summaryHandle.set).toBeDefined();
  act(() => summaryHandle.set!({ ...succeeded, startedAt: processing.startedAt, savedCount: 2 }));
  expect(within(card()).getByRole("status")).toHaveTextContent(
    "Refresh complete. 2 reviews new to this analysis were added; reviews already collected were kept.",
  );
  expect(within(card()).getByRole("button", { name: "Refresh reviews" })).toBeEnabled();
});

it("is disabled while any ingestion run is active", () => {
  renderControl({ summary: processing });
  expect(within(card()).getByRole("button", { name: "Refreshing…" })).toBeDisabled();
});

it.each([
  ["collection is unavailable", { unavailableReason: ingestionErrorMessage("INGESTION_DISABLED") }],
  ["the refresh details failed to load", { base: undefined }],
  ["the ingestion status failed to load", { summary: null }],
])("is disabled when %s", (_name, options) => {
  renderControl(options);
  expect(within(card()).getByRole("button", { name: "Refresh reviews" })).toBeDisabled();
});

it("points to the Ingestion panel instead of repeating its unavailable reason", () => {
  const reason = ingestionErrorMessage("INGESTION_DISABLED");
  renderControl({ unavailableReason: reason });
  expect(card()).toHaveTextContent(
    "Refreshing is paused until review collection is available again. The Ingestion panel explains why.",
  );
  expect(card()).not.toHaveTextContent(reason);
});

it("explains a billing hold instead of offering a refresh", () => {
  renderControl({
    summary: { ...processing, state: "failed", errorCode: "SUBMISSION_UNCERTAIN" },
  });
  expect(within(card()).getByRole("button", { name: "Refresh reviews" })).toBeDisabled();
  expect(card()).toHaveTextContent(reingestErrorMessage("REINGEST_BLOCKED"));
});

it("renders nothing before the first successful collection", () => {
  renderControl({ base: null, summary: { ...processing, state: "not_ingested" } });
  expect(screen.queryByRole("region", { name: "Refresh reviews" })).not.toBeInTheDocument();
});

it("keeps a failed refresh separate from the intact dataset and offers a retry", () => {
  renderControl({
    summary: { ...processing, state: "failed", errorCode: "NO_REVIEWS" },
  });
  expect(within(card()).getByRole("alert")).toHaveTextContent(
    `The last refresh didn't finish. ${ingestionErrorMessage("NO_REVIEWS")} Your previously collected reviews are unchanged.`,
  );
  expect(card()).toHaveTextContent("Current dataset: 3 reviews.");
  expect(within(card()).getByRole("button", { name: "Retry refresh" })).toBeEnabled();
});

it.each([
  [409, "REINGEST_IN_PROGRESS"],
  [409, "REINGEST_UNAVAILABLE"],
  [429, "INGESTION_START_LIMIT"],
  [503, "INGESTION_DISABLED"],
])("shows fixed copy for a %s %s response and allows a retry", async (status, code) => {
  fetchMock
    .mockResolvedValueOnce(
      jsonResponse(status, {
        success: false,
        error: { code, message: "private database detail" },
      }),
    )
    .mockResolvedValueOnce(jsonResponse(202, { success: true, data: processing }));
  renderControl();
  await act(async () =>
    fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" })),
  );
  expect(within(card()).getByRole("alert")).toHaveTextContent(reingestErrorMessage(code));
  expect(card()).not.toHaveTextContent("private database detail");
  if (code === "REINGEST_IN_PROGRESS") expect(mockRouter.refresh).toHaveBeenCalledTimes(1);

  await act(async () =>
    fireEvent.click(within(card()).getByRole("button", { name: "Retry refresh" })),
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(within(card()).queryByRole("alert")).not.toBeInTheDocument();
  expect(within(card()).getByRole("button", { name: "Refreshing…" })).toBeDisabled();
});

it("never shows a server-supplied message for an unexpected failure", async () => {
  fetchMock.mockResolvedValue(
    jsonResponse(500, { success: false, error: { code: "SOMETHING", message: "stack trace" } }),
  );
  renderControl();
  await act(async () =>
    fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" })),
  );
  expect(within(card()).getByRole("alert")).toHaveTextContent(ingestionErrorMessage("SOMETHING"));
  expect(card()).not.toHaveTextContent("stack trace");
});

it("treats a malformed success body as a failure", async () => {
  fetchMock.mockResolvedValue(jsonResponse(202, { success: true, data: { state: "processing" } }));
  renderControl();
  await act(async () =>
    fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" })),
  );
  expect(within(card()).getByRole("alert")).toHaveTextContent(
    reingestErrorMessage("REINGEST_START_FAILED"),
  );
});

it("shows network failures safely", async () => {
  fetchMock.mockRejectedValue(new Error("socket hang up"));
  renderControl();
  await act(async () =>
    fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" })),
  );
  expect(within(card()).getByRole("alert")).toHaveTextContent(
    "We couldn't reach ReviewLens. Please try again.",
  );
  expect(within(card()).getByRole("button", { name: "Retry refresh" })).toBeEnabled();
});

it("sends an expired session to sign-in and a lost target to the not-found copy", async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
  renderControl();
  await act(async () =>
    fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" })),
  );
  expect(mockRouter.replace).toHaveBeenCalledWith(
    `/login?next=${encodeURIComponent(`/analysis-targets/${TARGET_ID}`)}`,
  );

  fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));
  await act(async () =>
    fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" })),
  );
  expect(within(card()).getByRole("alert")).toHaveTextContent(
    "This target isn't available to your account. Go back to My Targets.",
  );
});

it("reloads the workspace when the provider rejects the refresh immediately", async () => {
  fetchMock.mockResolvedValue(
    jsonResponse(200, {
      success: true,
      data: { ...processing, state: "failed", errorCode: "PROVIDER_REJECTED" },
    }),
  );
  renderControl();
  await act(async () =>
    fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" })),
  );
  expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  expect(within(card()).getByRole("alert")).toHaveTextContent(
    "Your previously collected reviews are unchanged.",
  );
});

it("renders target names as text", () => {
  renderControl({ targetName: '<img src=x onerror="alert(1)">' });
  expect(card()).toHaveTextContent('collected for <img src=x onerror="alert(1)"> so far');
  expect(card().querySelector("img")).toBeNull();
});

it("omits the count when the reviews could not be loaded", () => {
  renderControl({ reviewCount: null });
  expect(card()).not.toHaveTextContent("Current dataset:");
  expect(card()).toHaveTextContent("It is the deduplicated union");
});
