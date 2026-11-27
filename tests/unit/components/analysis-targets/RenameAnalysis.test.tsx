import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RenameAnalysis } from "@/components/analysis-targets/RenameAnalysis";
import { AnalysisRenameError, renameAnalysisTarget } from "@/lib/api/analysis-targets";

const mockRefresh = jest.fn();
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: mockReplace, bfcacheId: "route-1" }),
}));
jest.mock("@/lib/api/analysis-targets", () => ({
  ...jest.requireActual("@/lib/api/analysis-targets"),
  renameAnalysisTarget: jest.fn(),
}));

async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Rename analysis" }));
  await waitFor(() => expect(screen.getByLabelText("Analysis name *")).toHaveFocus());
}
function save(name: string) {
  fireEvent.change(screen.getByLabelText("Analysis name *"), { target: { value: name } });
  fireEvent.submit(screen.getByRole("form", { name: "Rename analysis" }));
}
beforeEach(() => jest.clearAllMocks());

test("prefills current name, cancels without writing, and restores focus", async () => {
  render(<RenameAnalysis targetId="target-1" name="Original" />);
  await open();
  expect(screen.getByLabelText("Analysis name *")).toHaveValue("Original");
  fireEvent.change(screen.getByLabelText("Analysis name *"), { target: { value: "Draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(renameAnalysisTarget).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Rename analysis" })).toHaveFocus();
  await open();
  expect(screen.getByLabelText("Analysis name *")).toHaveValue("Original");
});
test("invalid names retain input and focus the error", async () => {
  render(<RenameAnalysis targetId="target-1" name="Original" />);
  await open();
  save("  ");
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a name for this target.");
  const input = screen.getByLabelText("Analysis name *");
  expect(input).toHaveValue("  ");
  expect(input).toHaveFocus();
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input.getAttribute("aria-describedby")).toContain(screen.getByRole("alert").id);
  expect(renameAnalysisTarget).not.toHaveBeenCalled();
});
test("saves trimmed name once, shows progress, refreshes, and preserves success on refreshed props", async () => {
  let resolve!: (value: never) => void;
  jest.mocked(renameAnalysisTarget).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = render(<RenameAnalysis targetId="target-1" name="Original" />);
  await open();
  save("  New name  ");
  await screen.findByRole("button", { name: "Renaming…" });
  expect(screen.getByRole("button", { name: "Renaming…" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("form", { name: "Rename analysis" }));
  expect(renameAnalysisTarget).toHaveBeenCalledTimes(1);
  expect(renameAnalysisTarget).toHaveBeenCalledWith(
    "target-1",
    "New name",
    expect.any(AbortSignal),
  );
  await act(async () => resolve({ id: "target-1", name: "New name" } as never));
  expect(screen.getByRole("status")).toHaveTextContent("Analysis renamed.");
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Rename analysis" })).toHaveFocus();
  view.rerender(<RenameAnalysis targetId="target-1" name="New name" />);
  await open();
  expect(screen.getByLabelText("Analysis name *")).toHaveValue("New name");
});

test("revalidates on change and blur after an invalid submit", async () => {
  render(<RenameAnalysis targetId="target-1" name="Original" />);
  await open();
  save(" ");
  await screen.findByRole("alert");
  const input = screen.getByLabelText("Analysis name *");
  fireEvent.change(input, { target: { value: "x".repeat(121) } });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("120 characters"));
  fireEvent.change(input, { target: { value: "Valid" } });
  fireEvent.blur(input);
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(renameAnalysisTarget).not.toHaveBeenCalled();
});

test("each retained workspace has its own form and help IDs", async () => {
  const { container } = render(
    <>
      <RenameAnalysis targetId="target-1" name="First" />
      <RenameAnalysis targetId="target-2" name="Second" />
    </>,
  );
  for (const trigger of screen.getAllByRole("button", { name: "Rename analysis" }))
    fireEvent.click(trigger);
  await waitFor(() => expect(screen.getAllByRole("form")).toHaveLength(2));
  const ids = Array.from(container.querySelectorAll("[id]")).map((node) => node.id);
  expect(new Set(ids).size).toBe(ids.length);
});
test.each([
  new AnalysisRenameError("RENAME_FAILED", "Please try again."),
  new Error("private details"),
])("shows a safe failure and retains input for retry", async (error) => {
  jest.mocked(renameAnalysisTarget).mockRejectedValue(error);
  render(<RenameAnalysis targetId="target-1" name="Original" />);
  await open();
  save("New name");
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private details");
  expect(screen.getByLabelText("Analysis name *")).toHaveValue("New name");
  expect(mockRefresh).not.toHaveBeenCalled();
});
test("server validation uses the field error and focuses it", async () => {
  jest
    .mocked(renameAnalysisTarget)
    .mockRejectedValue(
      new AnalysisRenameError("INVALID_ANALYSIS_TARGET_INPUT", "Invalid", [
        { field: "name", code: "TARGET_NAME_REQUIRED", message: "Enter a name for this target." },
      ]),
    );
  render(<RenameAnalysis targetId="target-1" name="Original" />);
  await open();
  save("New");
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a name for this target.");
  expect(screen.getByLabelText("Analysis name *")).toHaveFocus();
});
test("expired sessions return to sign in with this workspace destination", async () => {
  jest
    .mocked(renameAnalysisTarget)
    .mockRejectedValue(new AnalysisRenameError("AUTHENTICATION_REQUIRED", "Expired"));
  render(<RenameAnalysis targetId="target-1" name="Original" />);
  await open();
  save("New");
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith("/login?next=%2Fanalysis-targets%2Ftarget-1"),
  );
});
test("leaving while a save is pending aborts it and ignores late completion", async () => {
  let resolve!: (value: never) => void;
  jest.mocked(renameAnalysisTarget).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = render(<RenameAnalysis targetId="target-1" name="Original" />);
  await open();
  save("New");
  await screen.findByRole("button", { name: "Renaming…" });
  const signal = jest.mocked(renameAnalysisTarget).mock.calls[0][2]!;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ id: "target-1", name: "New" } as never));
  expect(mockRefresh).not.toHaveBeenCalled();
});
