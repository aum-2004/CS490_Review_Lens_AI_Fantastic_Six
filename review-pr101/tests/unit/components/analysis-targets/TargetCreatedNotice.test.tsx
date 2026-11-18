import { render, screen } from "@testing-library/react";
import { TargetCreatedNotice } from "@/components/analysis-targets/TargetCreatedNotice";

afterEach(() => window.history.replaceState(null, "", "/"));

it("offers ingestion only when it is available", () => {
  const { rerender } = render(<TargetCreatedNotice created canStart={false} completed={false} />);
  expect(screen.getByRole("status")).toHaveTextContent(/^Target created\.$/);
  expect(screen.queryByText(/You can now start ingestion/)).not.toBeInTheDocument();
  rerender(<TargetCreatedNotice created canStart completed={false} />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Target created. You can now start ingestion.",
  );
});
it("consumes only the creation marker without discarding other query parameters or history", () => {
  window.history.replaceState(
    null,
    "",
    "/analysis-targets/target-a?created=1&tab=reviews#ingestion",
  );
  const previousLength = window.history.length;
  const { unmount } = render(<TargetCreatedNotice created canStart={false} completed={false} />);
  expect(window.location.pathname + window.location.search + window.location.hash).toBe(
    "/analysis-targets/target-a?tab=reviews#ingestion",
  );
  expect(window.history.length).toBe(previousLength);
  expect(screen.getByRole("status")).toBeInTheDocument();
  unmount();
  render(
    <TargetCreatedNotice
      created={new URLSearchParams(window.location.search).get("created") === "1"}
      canStart={false}
      completed={false}
    />,
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("does not retain a creation notice after ingestion succeeds", () => {
  const { rerender } = render(<TargetCreatedNotice created canStart completed={false} />);
  rerender(<TargetCreatedNotice created canStart={false} completed />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("never announces creation without the marker", () => {
  render(<TargetCreatedNotice created={false} canStart completed={false} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
