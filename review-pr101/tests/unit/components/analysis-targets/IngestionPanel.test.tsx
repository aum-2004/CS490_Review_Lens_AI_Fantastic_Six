import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkspaceIngestion } from "@/components/ingestion/WorkspaceIngestion";
import { NO_INGESTION, type IngestionSummary } from "@/services/ingestion/ingestion-state";
const fetchMock = jest.fn();
const router = { replace: jest.fn(), refresh: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => router }));
const processing = { ...NO_INGESTION, state: "processing" as const };
const succeeded = { ...NO_INGESTION, state: "succeeded" as const, savedCount: 3 };
function response(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ success: status < 400, data }) };
}
function workspace(summary: IngestionSummary | null = NO_INGESTION, reason: string | null = null) {
  return (
    <WorkspaceIngestion
      targetId="target-a"
      targetName="Bakery"
      sourceUrl="https://www.google.com/maps/place/Synthetic"
      initialSummary={summary}
      unavailableReason={reason}
    />
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
  const button = screen.getByRole("button", { name: "Start ingestion" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  finish(response(processing, 202));
  await screen.findByText("Collecting reviews for Bakery from Google Maps…");
  expect(screen.getAllByText("Ingesting")).toHaveLength(2);
  expect(screen.queryByText(/reviews saved/)).not.toBeInTheDocument();
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
  expect(screen.getByText(/Further collection is unavailable/)).toBeInTheDocument();
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
it("updates both badges when a processing run finishes with skipped records", async () => {
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
it("updates both badges and announces the persisted failure when polling completes", async () => {
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
