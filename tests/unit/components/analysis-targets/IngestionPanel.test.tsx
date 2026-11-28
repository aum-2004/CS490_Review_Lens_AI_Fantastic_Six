import { Activity } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  WorkspaceIngestionProvider,
  WorkspaceIngestionStatus,
  useWorkspaceIngestion,
} from "@/components/ingestion/WorkspaceIngestionState";
import { WorkspaceIngestion } from "@/components/ingestion/WorkspaceIngestion";
import { NO_INGESTION, type IngestionSummary } from "@/services/ingestion/ingestion-state";
import {
  reingestErrorMessage,
  type RetryClassification,
} from "@/services/ingestion/ingestion-reingest-state";
const fetchMock = jest.fn();
const router = { replace: jest.fn(), refresh: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => router }));
const processing = { ...NO_INGESTION, state: "processing" as const };
const succeeded = { ...NO_INGESTION, state: "succeeded" as const, savedCount: 3 };
function response(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ success: status < 400, data }) };
}
function workspace(
  summary: IngestionSummary | null = NO_INGESTION,
  reason: string | null = null,
  identity = "user-a:target-a",
) {
  return (
    <WorkspaceIngestionProvider key={identity} initialSummary={summary}>
      <div role="group" aria-label="Header collection status">
        <WorkspaceIngestionStatus />
      </div>
      <WorkspaceIngestion
        targetId="target-a"
        targetName="Bakery"
        sourceUrl="https://www.google.com/maps/place/Synthetic"
        unavailableReason={reason}
        retryClassification="initial"
      />
    </WorkspaceIngestionProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
});
afterEach(() => jest.useRealTimers());

it("starts once and shows processing without claiming success", async () => {
  let finish!: (value: unknown) => void;
  fetchMock.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(workspace());
  const header = screen.getByRole("group", { name: "Header collection status" });
  expect(header).toHaveTextContent("Not ingested");
  const button = screen.getByRole("button", { name: "Start ingestion" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  expect(header).toHaveTextContent("Updating ingestion");
  expect(within(header).queryByText("Not ingested")).not.toBeInTheDocument();
  finish(response(processing, 202));
  await screen.findByText("Collecting reviews for Bakery from Google Maps…");
  expect(screen.getAllByText("Ingesting")).toHaveLength(2);
  expect(header).toHaveTextContent("Ingesting");
  expect(screen.queryByText(/reviews saved/)).not.toBeInTheDocument();
});

it("resets the shared status when the verified account/target key changes", async () => {
  fetchMock.mockResolvedValue(response(processing, 202));
  const { rerender } = render(workspace());
  fireEvent.click(screen.getByRole("button", { name: "Start ingestion" }));
  await waitFor(() => expect(screen.getAllByText("Ingesting")).toHaveLength(2));

  rerender(workspace(NO_INGESTION, null, "user-b:target-b"));

  expect(screen.getByRole("group", { name: "Header collection status" })).toHaveTextContent(
    "Not ingested",
  );
  expect(screen.queryByText("Ingesting")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start ingestion" })).toBeEnabled();
});

it("does not share a processing result with a separate workspace", async () => {
  fetchMock.mockResolvedValue(response(processing, 202));
  render(
    <>
      {workspace()}
      <WorkspaceIngestionProvider
        initialSummary={{ ...NO_INGESTION, state: "failed", errorCode: "PROVIDER_TIMEOUT" }}
      >
        <div role="group" aria-label="Other target collection status">
          <WorkspaceIngestionStatus />
        </div>
      </WorkspaceIngestionProvider>
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Start ingestion" }));
  await waitFor(() => expect(screen.getAllByText("Ingesting")).toHaveLength(2));
  expect(screen.getByRole("group", { name: "Other target collection status" })).toHaveTextContent(
    "Failed",
  );
});
it("blocks another submission after success and explains why", async () => {
  render(workspace(succeeded));
  expect(screen.getAllByText("Ingested")).toHaveLength(2);
  expect(screen.getByText(/Last completed run/)).toHaveTextContent(
    "3 reviews saved. 0 records were skipped.",
  );
  const button = screen.getByRole("button", { name: "Ingestion complete" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(fetchMock).not.toHaveBeenCalled();
  // S3-009: collection after a success happens through Refresh reviews, never this button.
  expect(
    screen.getByText(
      "Reviews have been collected for this target. To collect newer reviews, use Refresh reviews. New reviews are merged into this dataset and reviews already collected are kept.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Further collection is unavailable/)).not.toBeInTheDocument();
});
it("distinguishes partial ingestion using persisted skipped counts without enabling collection", () => {
  render(workspace({ ...succeeded, skippedCount: 2 }));
  expect(screen.getAllByText("Partially ingested")).toHaveLength(2);
  expect(screen.queryByText("Ingested", { exact: true })).not.toBeInTheDocument();
  expect(screen.getByText(/Last completed run/)).toHaveTextContent(
    "3 reviews saved. 2 unusable records were skipped.",
  );
  expect(screen.getByText(/Ingestion partially succeeded for Bakery/)).toHaveTextContent(
    "Only saved reviews are included in this target's dataset.",
  );
  expect(screen.getByRole("button", { name: "Ingestion complete" })).toBeDisabled();
});
it("updates the header and panel badges when a processing run finishes with skipped records", async () => {
  jest.useFakeTimers();
  fetchMock.mockResolvedValue(response({ ...succeeded, skippedCount: 1 }));
  render(workspace(processing));
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getAllByText("Partially ingested")).toHaveLength(2);
  expect(screen.queryByText("Ingesting")).not.toBeInTheDocument();
  expect(router.refresh).toHaveBeenCalled();
});
it("updates the header and panel badges and announces the persisted failure when polling completes", async () => {
  jest.useFakeTimers();
  fetchMock.mockResolvedValue(
    response({ ...NO_INGESTION, state: "failed", errorCode: "PROVIDER_TIMEOUT", skippedCount: 2 }),
  );
  render(workspace(processing));
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getAllByText("Failed")).toHaveLength(2);
  expect(screen.queryByText("Partially ingested")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("took too long");
  expect(screen.queryByText(/reviews saved/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
});
it("blocks a new paid start after expiry and explains operator reconciliation", () => {
  render(workspace({ ...NO_INGESTION, state: "failed", errorCode: "RESULT_WINDOW_EXPIRED" }));
  expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("four hours");
  expect(screen.getByRole("alert")).toHaveTextContent("Contact the project team");
});
it("polls a restored active run and refreshes persisted reviews on completion", async () => {
  jest.useFakeTimers();
  fetchMock.mockResolvedValue(response(succeeded));
  render(workspace(processing));
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(fetchMock).toHaveBeenCalledWith("/api/analysis-targets/target-a/ingestion/refresh", {
    method: "POST",
  });
  expect(screen.getByText(/Last completed run/)).toHaveTextContent(
    "3 reviews saved. 0 records were skipped.",
  );
  expect(screen.getAllByText("Ingested")).toHaveLength(2);
  expect(router.refresh).toHaveBeenCalled();
});
it("stops polling when leaving without cancelling the server job", async () => {
  jest.useFakeTimers();
  const { unmount } = render(workspace(processing));
  unmount();
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("automatically retries a lookup outage on the existing job without another submission", async () => {
  jest.useFakeTimers();
  fetchMock
    .mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ success: false, error: { code: "RESULT_LOOKUP_UNAVAILABLE" } }),
    })
    .mockResolvedValue(response(processing));
  render(workspace(processing));
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Your existing request is saved");
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  for (const [endpoint, options] of fetchMock.mock.calls) {
    expect(endpoint).toBe("/api/analysis-targets/target-a/ingestion/refresh");
    expect(options).toEqual({ method: "POST" });
  }
  expect(screen.getAllByText("Ingesting")).toHaveLength(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("bounds automatic retries before offering a manual status retry", async () => {
  jest.useFakeTimers();
  fetchMock.mockRejectedValue(new Error("synthetic outage"));
  render(workspace(processing));
  for (const delay of [5000, 10000, 20000]) {
    await act(async () => {
      jest.advanceTimersByTime(delay);
    });
  }
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  await act(async () => {
    jest.advanceTimersByTime(60000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  fetchMock.mockResolvedValue(response(processing));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await act(async () => {});
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(fetchMock).toHaveBeenLastCalledWith("/api/analysis-targets/target-a/ingestion/refresh", {
    method: "POST",
    signal: expect.any(AbortSignal),
  });
});
it("does not mistake unknown status for no ingestion, and retries a read before enabling start", async () => {
  fetchMock.mockResolvedValue(response(NO_INGESTION));
  render(workspace(null));
  expect(screen.queryByText("Not ingested")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("button", { name: "Start ingestion" });
  expect(fetchMock).toHaveBeenCalledWith("/api/analysis-targets/target-a/ingestion", {
    method: "GET",
    signal: expect.any(AbortSignal),
  });
});
it("redirects expired sessions back through sign in", async () => {
  fetchMock.mockResolvedValue(response(null, 401));
  render(workspace());
  fireEvent.click(screen.getByRole("button", { name: "Start ingestion" }));
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith("/login?next=%2Fanalysis-targets%2Ftarget-a"),
  );
});
it("disables known unavailable ingestion and explains why", () => {
  render(workspace(NO_INGESTION, "Storage permission is pending."));
  expect(screen.getByRole("button", { name: "Start ingestion" })).toBeDisabled();
  expect(screen.getByText("Storage permission is pending.")).toBeInTheDocument();
});
it("shows URL identity provenance without claiming an independent match", () => {
  render(
    workspace({
      ...succeeded,
      identityBasis: "provider_resolved",
      providerBusinessName: "Provider bakery",
    }),
  );
  expect(
    screen.getByText(/The review service identified this business as Provider bakery/),
  ).toHaveTextContent("has not been independently matched to the saved link");
});
it.each(["PROVIDER_TIMEOUT", "PROVIDER_QUOTA", "PROVIDER_UNAVAILABLE"])(
  "shows persisted %s failure distinctly",
  (code) => {
    render(workspace({ ...NO_INGESTION, state: "failed", errorCode: code }));
    expect(screen.getByRole("alert")).not.toHaveTextContent("private");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  },
);

// S3-009 / PR #137 review: retrying a failed refresh must start a new refresh.
const failedRefresh = {
  ...NO_INGESTION,
  state: "failed" as const,
  errorCode: "NO_REVIEWS",
  startedAt: "2026-11-27T09:00:00Z",
  finishedAt: "2026-11-27T09:01:00Z",
};
function refreshWorkspace(
  summary: IngestionSummary,
  retryClassification: RetryClassification,
  reason: string | null = null,
) {
  return (
    <WorkspaceIngestionProvider initialSummary={summary}>
      <WorkspaceIngestion
        targetId="target-a"
        targetName="Bakery"
        sourceUrl="https://www.google.com/maps/place/Synthetic"
        unavailableReason={reason}
        retryClassification={retryClassification}
      />
    </WorkspaceIngestionProvider>
  );
}
function conflict(code: string, status: number) {
  return {
    ok: false,
    status,
    json: async () => ({ success: false, error: { code, message: "private detail" } }),
  };
}

it("retries a failed refresh through the refresh endpoint, once", async () => {
  let finish!: (value: unknown) => void;
  fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  render(refreshWorkspace(failedRefresh, "refresh"));
  const button = screen.getByRole("button", { name: "Try again" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/analysis-targets/target-a/ingestion/reingest", {
    method: "POST",
    signal: expect.any(AbortSignal),
  });
  finish(response({ ...processing, startedAt: "2026-11-27T10:00:00Z" }, 202));
  await screen.findByText("Collecting reviews for Bakery from Google Maps…");
  expect(router.refresh).not.toHaveBeenCalled();
});

it("keeps retrying a failed first collection through the original start path", async () => {
  fetchMock.mockResolvedValue(response(processing, 202));
  render(refreshWorkspace(failedRefresh, "initial"));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Collecting reviews for Bakery from Google Maps…");
  expect(fetchMock).toHaveBeenCalledWith("/api/analysis-targets/target-a/ingestion", {
    method: "POST",
    signal: expect.any(AbortSignal),
  });
  expect(fetchMock).not.toHaveBeenCalledWith(
    "/api/analysis-targets/target-a/ingestion/reingest",
    expect.anything(),
  );
  expect(
    screen.queryByText(/This was a refresh of reviews already collected/),
  ).not.toBeInTheDocument();
});

it.each([
  ["REINGEST_IN_PROGRESS", 409, true],
  ["INGESTION_START_LIMIT", 429, false],
])("shows safe copy when a refresh retry returns %s", async (code, status, reloads) => {
  fetchMock.mockResolvedValue(conflict(code, status));
  render(refreshWorkspace(failedRefresh, "refresh"));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toContain(
      reingestErrorMessage(code),
    ),
  );
  expect(document.body).not.toHaveTextContent("private detail");
  expect(router.refresh).toHaveBeenCalledTimes(reloads ? 1 : 0);
});

it("explains that a failed refresh left the collected reviews in place", () => {
  render(refreshWorkspace(failedRefresh, "refresh"));
  expect(
    screen.getByText(
      "This was a refresh of reviews already collected for this target. They are unchanged and still available. Try again starts a new refresh.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
});

it("does not promise a retry for a refresh held for reconciliation", () => {
  render(refreshWorkspace({ ...failedRefresh, errorCode: "SUBMISSION_UNCERTAIN" }, "refresh"));
  expect(
    screen.getByText(
      "This was a refresh of reviews already collected for this target. They are unchanged and still available.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Try again starts a new refresh/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
});

it("says why newer reviews can't be collected while collection is unavailable", () => {
  render(refreshWorkspace(succeeded, "initial", "Storage permission is pending."));
  expect(
    screen.getByText(
      "Reviews have been collected for this target. Collecting newer reviews is unavailable right now; the reason is shown below.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("Storage permission is pending.")).toBeInTheDocument();
  expect(screen.queryByText(/Further collection is unavailable/)).not.toBeInTheDocument();
});

// ---------------------------------------------------------------------------------------------
// PR #137 review (Shawn): a late "Try again" response never acts on a workspace the user left
// ---------------------------------------------------------------------------------------------
const RETRY_REINGEST = "/api/analysis-targets/target-a/ingestion/reingest";

function SharedState() {
  const { summary, pending } = useWorkspaceIngestion();
  return <output aria-label="Shared ingestion state">{`${summary?.state}|${pending}`}</output>;
}

function retryWorkspace({
  mode = "visible" as "visible" | "hidden" | "unmounted",
  userId = "user-a",
  targetId = "target-a",
  retryClassification = "refresh" as RetryClassification,
} = {}) {
  // No provider key: the panel itself must reject a stale response while it stays mounted.
  return (
    <WorkspaceIngestionProvider initialSummary={failedRefresh}>
      <SharedState />
      {mode !== "unmounted" && (
        <Activity mode={mode}>
          <WorkspaceIngestion
            userId={userId}
            targetId={targetId}
            targetName="Bakery"
            sourceUrl="https://www.google.com/maps/place/Synthetic"
            unavailableReason={null}
            retryClassification={retryClassification}
          />
        </Activity>
      )}
    </WorkspaceIngestionProvider>
  );
}

type PendingFetch = { url: string; resolve: (value: unknown) => void; signal: AbortSignal };
/** Each call stays pending until the test resolves it; optionally rejects like a browser abort. */
function deferredFetch({ rejectOnAbort = false } = {}) {
  const calls: PendingFetch[] = [];
  fetchMock.mockImplementation(
    (url: string, init: RequestInit) =>
      new Promise((resolve, reject) => {
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
function tryAgain() {
  return screen.getByRole("button", { name: "Try again" });
}

const leaves = {
  unmount: (view: ReturnType<typeof render>) =>
    view.rerender(retryWorkspace({ mode: "unmounted" })),
  "Activity hide": (view: ReturnType<typeof render>) =>
    view.rerender(retryWorkspace({ mode: "hidden" })),
  "target change": (view: ReturnType<typeof render>) =>
    view.rerender(retryWorkspace({ targetId: "target-b" })),
  "account change": (view: ReturnType<typeof render>) =>
    view.rerender(retryWorkspace({ userId: "user-b" })),
};
const lateRetryResponses = {
  "401": () => response(null, 401),
  "404": () => response(null, 404),
  "accepted refresh": () => response({ ...processing, startedAt: "2026-11-27T10:00:00Z" }, 202),
  "terminal result": () =>
    response({
      ...failedRefresh,
      errorCode: "PROVIDER_REJECTED",
      startedAt: "2026-11-27T10:00:00Z",
    }),
  "in-progress conflict": () => conflict("REINGEST_IN_PROGRESS", 409),
};

describe.each(Object.entries(leaves))("Try again, after %s", (leave, leaveWorkspace) => {
  const stillMounted = leave === "target change" || leave === "account change";

  it.each(Object.keys(lateRetryResponses) as Array<keyof typeof lateRetryResponses>)(
    "a late %s response does not redirect, refresh, or update shared state",
    async (kind) => {
      const calls = deferredFetch();
      const view = render(retryWorkspace());
      fireEvent.click(tryAgain());
      expect(calls[0].url).toBe(RETRY_REINGEST);
      expect(sharedState()).toHaveTextContent("failed|true");

      act(() => leaveWorkspace(view));
      // Cleanup aborts only the browser request and sends nothing else to the server.
      expect(calls[0].signal.aborted).toBe(true);
      // The provider stays mounted: cleanup released the pending flag the request had set.
      expect(sharedState()).toHaveTextContent("failed|false");
      await act(async () => calls[0].resolve(lateRetryResponses[kind]()));

      expect(router.replace).not.toHaveBeenCalled();
      expect(router.refresh).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // Neither onSummary nor onPendingChange ran for the stale response, nor its finally block.
      expect(sharedState()).toHaveTextContent("failed|false");
      if (stillMounted) {
        // Only the persisted failure is shown; the stale response added no banner.
        expect(screen.getAllByRole("alert")).toHaveLength(1);
        expect(tryAgain()).toBeEnabled();
      }
    },
  );

  it("aborts the request; the AbortError shows no error and sends no cancel request", async () => {
    const calls = deferredFetch({ rejectOnAbort: true });
    const view = render(retryWorkspace());
    fireEvent.click(tryAgain());
    await act(async () => leaveWorkspace(view));

    expect(calls[0].signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(sharedState()).toHaveTextContent("failed|false");
    expect(document.body).not.toHaveTextContent("We couldn't reach ReviewLens");
    if (stillMounted) expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

it("resyncs from the server, not stuck processing, when an abandoned retry's page is restored", async () => {
  deferredFetch({ rejectOnAbort: true });
  const view = render(retryWorkspace());
  fireEvent.click(tryAgain());
  await act(async () => view.rerender(retryWorkspace({ mode: "hidden" })));
  expect(router.refresh).not.toHaveBeenCalled();

  await act(async () => view.rerender(retryWorkspace({ mode: "visible" })));
  // The server may have started the refresh: reload the persisted status instead of guessing.
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(document.body).not.toHaveTextContent("We couldn't reach ReviewLens");
  expect(tryAgain()).toBeEnabled();
  expect(sharedState()).toHaveTextContent("failed|false");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("keeps a newer retry working when a stale one resolves late", async () => {
  const calls = deferredFetch();
  const view = render(retryWorkspace());
  fireEvent.click(tryAgain());
  await act(async () => view.rerender(retryWorkspace({ mode: "hidden" })));
  await act(async () => view.rerender(retryWorkspace({ mode: "visible" })));

  fireEvent.click(tryAgain());
  expect(calls).toHaveLength(2);
  expect(calls[1].signal.aborted).toBe(false);

  // The stale request's late response and its finally block must not touch the newer one.
  await act(async () => calls[0].resolve(response(null, 401)));
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Starting ingestion..." })).toBeDisabled();
  expect(sharedState()).toHaveTextContent("failed|true");

  await act(async () =>
    calls[1].resolve(response({ ...processing, startedAt: "2026-11-27T10:00:00Z" }, 202)),
  );
  expect(screen.getByText("Collecting reviews for Bakery from Google Maps…")).toBeInTheDocument();
  expect(sharedState()).toHaveTextContent("processing|false");
});

it("still redirects a 401 for the current target, including after a stale retry", async () => {
  const calls = deferredFetch();
  const view = render(retryWorkspace());
  fireEvent.click(tryAgain());
  view.rerender(retryWorkspace({ targetId: "target-b" }));

  fireEvent.click(tryAgain());
  expect(calls[1].url).toBe("/api/analysis-targets/target-b/ingestion/reingest");
  await act(async () => calls[0].resolve(response(null, 401)));
  expect(router.replace).not.toHaveBeenCalled();

  await act(async () => calls[1].resolve(response(null, 401)));
  expect(router.replace).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith("/login?next=%2Fanalysis-targets%2Ftarget-b");
});

it("guards a failed first collection's retry the same way, on its original start path", async () => {
  const calls = deferredFetch();
  const view = render(retryWorkspace({ retryClassification: "initial" }));
  fireEvent.click(tryAgain());
  expect(calls[0].url).toBe("/api/analysis-targets/target-a/ingestion");

  act(() => view.rerender(retryWorkspace({ retryClassification: "initial", mode: "unmounted" })));
  expect(calls[0].signal.aborted).toBe(true);
  await act(async () => calls[0].resolve(response(processing, 202)));
  expect(sharedState()).toHaveTextContent("failed|false");
  expect(router.refresh).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------------------------
// PR #137 review (Shawn): a failed run of unknown kind is never restarted on a guessed path
// ---------------------------------------------------------------------------------------------
const UNKNOWN_COPY =
  "We couldn't confirm whether the run that failed was a refresh or a first collection, so Try again is paused to avoid starting the wrong one. Any saved reviews are unchanged.";

it("disables Try again for a failed run of unknown kind and offers Check again instead", () => {
  render(refreshWorkspace(failedRefresh, "unknown"));
  const retry = screen.getByRole("button", { name: "Try again" });
  expect(retry).toBeDisabled();
  expect(retry).toHaveAccessibleDescription(UNKNOWN_COPY);
  expect(screen.getByText(UNKNOWN_COPY)).toHaveAttribute("role", "status");
  fireEvent.click(retry);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.queryByText(/This was a refresh/)).not.toBeInTheDocument();

  const check = screen.getByRole("button", { name: "Check again" });
  expect(check.tagName).toBe("BUTTON");
  fireEvent.click(check);
  // Check again reloads the server data that runs both lookups; it starts nothing itself.
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("leaves a held run of unknown kind to the hold copy", () => {
  render(refreshWorkspace({ ...failedRefresh, errorCode: "SUBMISSION_UNCERTAIN" }, "unknown"));
  expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
});

it.each([
  ["refresh", "/api/analysis-targets/target-a/ingestion/reingest"],
  ["initial", "/api/analysis-targets/target-a/ingestion"],
] as const)("routes Try again once the classification arrives as %s", async (kind, url) => {
  fetchMock.mockResolvedValue(response(processing, 202));
  const view = render(refreshWorkspace(failedRefresh, "unknown"));
  view.rerender(refreshWorkspace(failedRefresh, kind));
  expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Collecting reviews for Bakery from Google Maps…");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(url, { method: "POST", signal: expect.any(AbortSignal) });
});

it("never starts a run when a status reload recovers a failed run of unknown kind", async () => {
  fetchMock.mockResolvedValue(response(failedRefresh));
  render(
    <WorkspaceIngestionProvider initialSummary={null}>
      <WorkspaceIngestion
        targetId="target-a"
        targetName="Bakery"
        sourceUrl="https://www.google.com/maps/place/Synthetic"
        unavailableReason={null}
        retryClassification="unknown"
      />
    </WorkspaceIngestionProvider>,
  );
  // With no status, Try again only reloads the status (a GET), which is not a start.
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("button", { name: "Check again" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/analysis-targets/target-a/ingestion", {
    method: "GET",
    signal: expect.any(AbortSignal),
  });
  const retry = screen.getByRole("button", { name: "Try again" });
  expect(retry).toBeDisabled();
  fireEvent.click(retry);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

// The reload path sends no client request: nothing can arrive late, abort, or redirect.
const unknownKind = { retryClassification: "unknown" as RetryClassification };
const leavesWhileUnknown = {
  unmount: (view: ReturnType<typeof render>) =>
    view.rerender(retryWorkspace({ ...unknownKind, mode: "unmounted" })),
  "Activity hide and restore": (view: ReturnType<typeof render>) => {
    view.rerender(retryWorkspace({ ...unknownKind, mode: "hidden" }));
    view.rerender(retryWorkspace(unknownKind));
  },
  "target change": (view: ReturnType<typeof render>) =>
    view.rerender(retryWorkspace({ ...unknownKind, targetId: "target-b" })),
  "account change": (view: ReturnType<typeof render>) =>
    view.rerender(retryWorkspace({ ...unknownKind, userId: "user-b" })),
};
it.each(Object.entries(leavesWhileUnknown))(
  "Check again followed by %s fetches nothing, redirects nowhere, and changes no shared state",
  async (_leave, leaveWorkspace) => {
    const view = render(retryWorkspace(unknownKind));
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => leaveWorkspace(view));

    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sharedState()).toHaveTextContent("failed|false");
  },
);
