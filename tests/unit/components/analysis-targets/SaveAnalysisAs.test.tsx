// S3-003: the Save As form suggests a valid name, validates it, copies once, and opens the copy.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SaveAnalysisAs, suggestedCopyName } from "@/components/analysis-targets/SaveAnalysisAs";
import { AnalysisSaveAsError, saveAnalysisAs } from "@/lib/api/analysis-targets";

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, bfcacheId: "route-1" }),
}));
jest.mock("@/lib/api/analysis-targets", () => ({
  ...jest.requireActual("@/lib/api/analysis-targets"),
  saveAnalysisAs: jest.fn(),
}));

const copy = {
  id: "copy-1",
  name: "Weekend copy",
  sourceUrl: "https://maps.google.com/?cid=1",
  platform: "google_maps" as const,
};
const label = "New analysis name *";

async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Save as new analysis" }));
  await waitFor(() => expect(screen.getByLabelText(label)).toHaveFocus());
}
function save(name: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: name } });
  fireEvent.submit(screen.getByRole("form", { name: "Save as new analysis" }));
}
beforeEach(() => jest.clearAllMocks());

test("suggests '<name> (copy)' and keeps it within 120 characters", () => {
  expect(suggestedCopyName("Bakery")).toBe("Bakery (copy)");
  const long = suggestedCopyName("é".repeat(200));
  expect(Array.from(long)).toHaveLength(120);
  expect(long.endsWith(" (copy)")).toBe(true);
  expect(suggestedCopyName(`${"a".repeat(112)} b`)).toBe(`${"a".repeat(112)} (copy)`);
});

test("prefills the suggestion, explains what is copied, and cancels without writing", async () => {
  render(<SaveAnalysisAs targetId="target-1" name="Bakery" />);
  await open();
  expect(screen.getByLabelText(label)).toHaveValue("Bakery (copy)");
  expect(screen.getByText(/Q&A history isn't copied/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(saveAnalysisAs).not.toHaveBeenCalled();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save as new analysis" })).toHaveFocus();
});

test("rejects an invalid name before sending anything", async () => {
  render(<SaveAnalysisAs targetId="target-1" name="Bakery" />);
  await open();
  save("   ");
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a name for this target.");
  expect(screen.getByLabelText(label)).toHaveFocus();
  expect(saveAnalysisAs).not.toHaveBeenCalled();
});

test("re-checks the name on blur after a failed submit", async () => {
  render(<SaveAnalysisAs targetId="target-1" name="Bakery" />);
  await open();
  save("   ");
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(label), { target: { value: "Fixed name" } });
  fireEvent.blur(screen.getByLabelText(label));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(saveAnalysisAs).not.toHaveBeenCalled();
});

test("saves the trimmed name once and opens the new analysis", async () => {
  let resolve!: (value: typeof copy) => void;
  jest.mocked(saveAnalysisAs).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<SaveAnalysisAs targetId="target-1" name="Bakery" />);
  await open();
  save("  Weekend copy  ");
  await screen.findByRole("button", { name: "Saving…" });
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("form", { name: "Save as new analysis" }));
  expect(saveAnalysisAs).toHaveBeenCalledTimes(1);
  expect(saveAnalysisAs).toHaveBeenCalledWith("target-1", "Weekend copy", expect.any(AbortSignal));
  await act(async () => resolve(copy));
  expect(mockPush).toHaveBeenCalledWith("/analysis-targets/copy-1");
  // Still busy while the new analysis opens, so it cannot be copied twice.
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
});

test.each([
  [
    "the analysis limit",
    new AnalysisSaveAsError("ANALYSIS_LIMIT", "Limit reached."),
    "Limit reached.",
  ],
  [
    "a lost analysis",
    new AnalysisSaveAsError("TARGET_NOT_FOUND", "This analysis isn't available to your account."),
    "This analysis isn't available to your account.",
  ],
  [
    "an unexpected error",
    new Error("boom"),
    "We couldn't save a copy of this analysis. Please try again.",
  ],
])("shows %s and keeps the typed name", async (_case, error, message) => {
  jest.mocked(saveAnalysisAs).mockRejectedValue(error);
  render(<SaveAnalysisAs targetId="target-1" name="Bakery" />);
  await open();
  save("Weekend copy");
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(screen.getByLabelText(label)).toHaveValue("Weekend copy");
  expect(screen.getByRole("button", { name: "Save copy" })).toBeEnabled();
  expect(mockPush).not.toHaveBeenCalled();
});

test("shows server validation on the field", async () => {
  jest.mocked(saveAnalysisAs).mockRejectedValue(
    new AnalysisSaveAsError("INVALID_ANALYSIS_TARGET_INPUT", "Fix it", [
      {
        field: "name",
        code: "TARGET_NAME_TOO_LONG",
        message: "Target names can be up to 120 characters.",
      },
    ]),
  );
  render(<SaveAnalysisAs targetId="target-1" name="Bakery" />);
  await open();
  save("Weekend copy");
  expect(await screen.findByText("Target names can be up to 120 characters.")).toBeInTheDocument();
  expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
});

test("sends an expired session to sign in and back to this analysis", async () => {
  jest
    .mocked(saveAnalysisAs)
    .mockRejectedValue(new AnalysisSaveAsError("AUTHENTICATION_REQUIRED", "Expired"));
  render(<SaveAnalysisAs targetId="target 1" name="Bakery" />);
  await open();
  save("Weekend copy");
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith("/login?next=%2Fanalysis-targets%2Ftarget%201"),
  );
});

test("aborts an in-flight copy when the page unmounts", async () => {
  let signal: AbortSignal | undefined;
  jest.mocked(saveAnalysisAs).mockImplementation((_id, _name, s) => {
    signal = s;
    return new Promise(() => undefined);
  });
  const view = render(<SaveAnalysisAs targetId="target-1" name="Bakery" />);
  await open();
  save("Weekend copy");
  await waitFor(() => expect(signal).toBeDefined());
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
