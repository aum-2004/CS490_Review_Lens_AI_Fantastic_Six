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
it("hides previous success badges and announcements while a new request is pending", async () => {
  let finish!: (value: unknown) => void;
  fetchMock.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(workspace(succeeded));
  expect(screen.getAllByText("Ingested")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Start ingestion" }));
  expect(screen.queryByText(/3 reviews saved/)).not.toBeInTheDocument();
  expect(screen.queryByText("Ingested")).not.toBeInTheDocument();
  expect(screen.getByText("Updating ingestion…")).toBeInTheDocument();
  finish(response(processing, 202));
  await screen.findByText("Collecting reviews for Bakery from Google Maps…");
});
it("polls a restored active run and refreshes persisted reviews on completion", async () => {
  jest.useFakeTimers();
  fetchMock.mockResolvedValue(response(succeeded));
  render(workspace(processing));
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  expect(fetchMock).toHaveBeenCalledWith("/api/analysis-targets/target-a/ingestion/refresh", {
    method: "POST",
  });
  expect(screen.getByText("Last completed run: 3 reviews saved.")).toBeInTheDocument();
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
