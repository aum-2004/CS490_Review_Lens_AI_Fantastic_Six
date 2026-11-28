import { Activity, useEffect } from "react";
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
        userId="user-a"
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
    signal: expect.any(AbortSignal),
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

// ---------------------------------------------------------------------------------------------
// PR #137 review: late responses must never act on a workspace the user has left
// ---------------------------------------------------------------------------------------------
const OTHER_TARGET_ID = "44444444-4444-4444-8444-444444444444";

function SharedState() {
  const { summary, pending } = useWorkspaceIngestion();
  return <output aria-label="Shared ingestion state">{`${summary?.state}|${pending}`}</output>;
}

function workspace({
  mode = "visible" as "visible" | "hidden",
  userId = "user-a",
  targetId = TARGET_ID,
} = {}) {
  return (
    <WorkspaceIngestionProvider initialSummary={succeeded}>
      <SharedState />
      <Activity mode={mode}>
        <ReingestReviews
          userId={userId}
          targetId={targetId}
          targetName="Bakery"
          reviewCount={3}
          baseline={baseline}
          unavailableReason={null}
        />
      </Activity>
    </WorkspaceIngestionProvider>
  );
}

type PendingFetch = { url: string; resolve: (response: Response) => void; signal: AbortSignal };
/** Each call stays pending until the test resolves it; optionally rejects like a browser abort. */
function deferredFetch({ rejectOnAbort = false } = {}) {
  const calls: PendingFetch[] = [];
  fetchMock.mockImplementation(
    (url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init.signal as AbortSignal;
        calls.push({ url, resolve, signal });
        if (rejectOnAbort)
          signal.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
      }),
  );
  return calls;
}

function sharedState() {
  return screen.getByRole("status", { name: "Shared ingestion state" });
}

const leaves = {
  unmount: (view: ReturnType<typeof render>) => view.unmount(),
  "Activity hide": (view: ReturnType<typeof render>) =>
    view.rerender(workspace({ mode: "hidden" })),
  "target change": (view: ReturnType<typeof render>) =>
    view.rerender(workspace({ targetId: OTHER_TARGET_ID })),
  "account change": (view: ReturnType<typeof render>) =>
    view.rerender(workspace({ userId: "user-b" })),
};
const lateResponses = {
  "401": () => jsonResponse(401, {}),
  "404": () => jsonResponse(404, {}),
  "terminal failure": () =>
    jsonResponse(200, {
      success: true,
      data: { ...processing, state: "failed", errorCode: "PROVIDER_REJECTED" },
    }),
  "accepted refresh": () => jsonResponse(202, { success: true, data: processing }),
  "in-progress conflict": () =>
    jsonResponse(409, {
      success: false,
      error: { code: "REINGEST_IN_PROGRESS", message: "x" },
    }),
};

describe.each(Object.entries(leaves))("after %s", (leave, leaveWorkspace) => {
  it.each(Object.keys(lateResponses) as Array<keyof typeof lateResponses>)(
    "a late %s response does not navigate, refresh, or update shared state",
    async (kind) => {
      const calls = deferredFetch();
      const view = render(workspace());
      fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" }));
      expect(sharedState()).toHaveTextContent("succeeded|true");

      act(() => leaveWorkspace(view));
      // Cleanup aborts only the browser request and sends nothing else to the server.
      expect(calls[0].signal.aborted).toBe(true);
      await act(async () => calls[0].resolve(lateResponses[kind]()));

      expect(mockRouter.replace).not.toHaveBeenCalled();
      expect(mockRouter.refresh).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      if (leave !== "unmount") {
        // The provider stays mounted: the stale response left the shared state alone, and the
        // cleanup released the pending flag that request had set.
        expect(sharedState()).toHaveTextContent("succeeded|false");
      }
      if (leave === "target change" || leave === "account change") {
        expect(within(card()).queryByRole("alert")).not.toBeInTheDocument();
        expect(within(card()).getByRole("button", { name: "Refresh reviews" })).toBeEnabled();
      }
    },
  );
});

it("swallows the browser AbortError and resyncs from the server after Activity restore", async () => {
  deferredFetch({ rejectOnAbort: true });
  const view = render(workspace());
  fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" }));
  await act(async () => view.rerender(workspace({ mode: "hidden" })));
  expect(mockRouter.refresh).not.toHaveBeenCalled();

  await act(async () => view.rerender(workspace({ mode: "visible" })));
  // The server may have started the run: reload the persisted status instead of guessing.
  expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  expect(within(card()).queryByRole("alert")).not.toBeInTheDocument();
  expect(within(card()).getByRole("button", { name: "Refresh reviews" })).toBeEnabled();
  expect(sharedState()).toHaveTextContent("succeeded|false");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not resync a restored workspace that had no request in flight", async () => {
  const view = render(workspace());
  await act(async () => view.rerender(workspace({ mode: "hidden" })));
  await act(async () => view.rerender(workspace({ mode: "visible" })));
  expect(mockRouter.refresh).not.toHaveBeenCalled();
});

it("keeps the newer request working when a stale one resolves late", async () => {
  const calls = deferredFetch();
  const view = render(workspace());
  fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" }));
  await act(async () => view.rerender(workspace({ mode: "hidden" })));
  await act(async () => view.rerender(workspace({ mode: "visible" })));

  fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" }));
  expect(calls).toHaveLength(2);
  expect(calls[1].signal.aborted).toBe(false);

  // The stale request's late response and its finally block must not touch the newer one.
  await act(async () => calls[0].resolve(jsonResponse(401, {})));
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(within(card()).getByRole("button", { name: "Starting refresh…" })).toBeDisabled();
  expect(sharedState()).toHaveTextContent("succeeded|true");

  await act(async () => calls[1].resolve(jsonResponse(202, { success: true, data: processing })));
  expect(within(card()).getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  expect(sharedState()).toHaveTextContent("processing|false");
});

it("still redirects a 401 for the current target, including after a stale request", async () => {
  const calls = deferredFetch();
  const view = render(workspace());
  fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" }));
  view.rerender(workspace({ targetId: OTHER_TARGET_ID }));

  fireEvent.click(within(card()).getByRole("button", { name: "Refresh reviews" }));
  expect(calls[1].url).toBe(`/api/analysis-targets/${OTHER_TARGET_ID}/ingestion/reingest`);
  await act(async () => calls[0].resolve(jsonResponse(401, {})));
  expect(mockRouter.replace).not.toHaveBeenCalled();

  await act(async () => calls[1].resolve(jsonResponse(401, {})));
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith(
    `/login?next=${encodeURIComponent(`/analysis-targets/${OTHER_TARGET_ID}`)}`,
  );
});
