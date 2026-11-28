import { Activity } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeleteAnalysis } from "@/components/analysis-targets/DeleteAnalysis";

const fetchMock = jest.fn();
const done = jest.fn();
const props = {
  targetId: "target-a",
  targetName: '<img src=x onerror="alert(1)">',
  onDeleted: done,
};
const open = () => fireEvent.click(screen.getByRole("button", { name: "Delete analysis" }));
const remove = () => fireEvent.click(screen.getByRole("button", { name: "Permanently delete" }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { deleted: true } }),
  });
});
it("requires confirmation, describes irreversible deletion/retention, escapes names, and cancel/Escape never delete", () => {
  render(<DeleteAnalysis {...props} />);
  open();
  expect(screen.getByRole("dialog", { name: "Delete analysis?" })).toHaveTextContent(
    "This cannot be undone",
  );
  expect(screen.getByRole("dialog")).toHaveTextContent("Ingestion audit records are retained");
  expect(document.querySelector("img")).toBeNull();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete analysis" })).toHaveFocus();
  open();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true, bubbles: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
it("only sends DELETE to the target URL and navigates after verified success", async () => {
  render(<DeleteAnalysis {...props} />);
  open();
  remove();
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/analysis-targets/target-a",
    expect.objectContaining({
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
      signal: expect.any(AbortSignal),
    }),
  );
  expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("body");
});
it.each(["network", "json", "http", "invalid-success"])(
  "retains confirmation for retry after %s failure and never shows raw errors",
  async (failure) => {
    if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("SECRET"));
    else
      fetchMock.mockResolvedValueOnce({
        ok: failure !== "http",
        json:
          failure === "json"
            ? async () => {
                throw new Error("SECRET");
              }
            : async () => ({ success: false, error: "SECRET" }),
      });
    render(<DeleteAnalysis {...props} />);
    open();
    remove();
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't delete this analysis");
    expect(document.body).not.toHaveTextContent("SECRET");
    expect(done).not.toHaveBeenCalled();
    remove();
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  },
);
it("prevents duplicate submits and blocks Escape/cancel during deletion", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(<DeleteAnalysis {...props} />);
  open();
  remove();
  fireEvent.click(screen.getByRole("button", { name: "Deleting…" }));
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () =>
    resolve({ ok: true, json: async () => ({ success: true, data: { deleted: true } }) }),
  );
  expect(done).toHaveBeenCalledTimes(1);
});
it.each([200, 404])(
  "ignores late %s after Activity hides/restores the old workspace",
  async (status) => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <DeleteAnalysis {...props} />
      </Activity>
    );
    const { rerender } = render(view("visible"));
    open();
    remove();
    const signal = fetchMock.mock.calls[0][1].signal;
    rerender(view("hidden"));
    rerender(view("visible"));
    await act(async () =>
      resolve({
        status,
        ok: status === 200,
        json: async () => ({ success: true, data: { deleted: true } }),
      }),
    );
    expect(signal.aborted).toBe(true);
    expect(done).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  },
);

it.each([
  ["unmount", 200],
  ["unmount", 404],
  ["hide", 200],
  ["hide", 404],
] as const)(
  "ignores late %s response with HTTP %s before any workspace restore",
  async (leave, status) => {
    let finish!: (response: unknown) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <DeleteAnalysis {...props} />
      </Activity>
    );
    const { unmount, rerender } = render(view("visible"));
    open();
    remove();
    const signal: AbortSignal = fetchMock.mock.calls[0][1].signal;
    if (leave === "unmount") unmount();
    else rerender(view("hidden"));
    expect(signal.aborted).toBe(true);

    // Resolve despite abort: navigation must be guarded even if the transport already completed.
    const json = jest.fn(async () => ({ success: true, data: { deleted: true } }));
    await act(async () => {
      finish({ status, ok: status === 200, json });
    });
    expect(done).not.toHaveBeenCalled();
    if (status === 404) expect(json).not.toHaveBeenCalled();
    if (leave === "hide") {
      rerender(view("visible"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(done).not.toHaveBeenCalled();
    }
  },
);

it("leaves an unavailable workspace on 404 without reading or displaying the error body", async () => {
  const json = jest.fn().mockRejectedValue(new Error("PRIVATE ERROR"));
  fetchMock.mockResolvedValueOnce({ status: 404, ok: false, json });
  render(<DeleteAnalysis {...props} />);
  open();
  remove();
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(json).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it.each([401, 403, 500])("does not navigate on HTTP %s", async (status) => {
  fetchMock.mockResolvedValueOnce({ status, ok: false, json: async () => ({ success: false }) });
  render(<DeleteAnalysis {...props} />);
  open();
  remove();
  await screen.findByRole("alert");
  expect(done).not.toHaveBeenCalled();
});

it.each([
  null,
  {},
  { success: true },
  { success: true, data: null },
  { success: true, data: {} },
  { success: true, data: { deleted: false } },
])("never navigates on a malformed success envelope: %p", async (body) => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => body });
  render(<DeleteAnalysis {...props} />);
  open();
  remove();
  await screen.findByRole("alert");
  expect(done).not.toHaveBeenCalled();
});

it("ignores an old failure after the workspace is hidden/restored", async () => {
  let reject!: (reason: unknown) => void;
  fetchMock.mockReturnValueOnce(
    new Promise((_resolve, r) => {
      reject = r;
    }),
  );
  const view = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <DeleteAnalysis {...props} />
    </Activity>
  );
  const { rerender } = render(view("visible"));
  open();
  remove();
  rerender(view("hidden"));
  rerender(view("visible"));
  await act(async () => reject(new Error("SECRET")));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(done).not.toHaveBeenCalled();
});

it("bounds a stalled browser request and allows retry", async () => {
  jest.useFakeTimers();
  try {
    fetchMock.mockImplementationOnce(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("Aborted")));
        }),
    );
    render(<DeleteAnalysis {...props} />);
    open();
    remove();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't delete this analysis");
    expect(screen.getByRole("button", { name: "Permanently delete" })).toBeEnabled();
    expect(done).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
