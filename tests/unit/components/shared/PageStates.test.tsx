import { fireEvent, render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";

it("renders a reusable page heading, breadcrumb navigation and a supplied action", () => {
  render(
    <PageHeader
      title="Target workspace"
      description="Reviews for this target."
      breadcrumbs={[{ label: "My Targets", href: "/analysis-targets" }, { label: "Coffee shop" }]}
      action={<a href="/analysis-targets/new">Create target</a>}
    />,
  );
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "Target workspace" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toContainElement(
    screen.getByRole("link", { name: "My Targets" }),
  );
  expect(screen.getByText("Coffee shop")).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Create target" })).toHaveAttribute(
    "href",
    "/analysis-targets/new",
  );
});

it("keeps a supplied recovery action functional and exposes one accessible safe error", () => {
  const retry = jest.fn();
  render(
    <ErrorState
      message="We couldn't load your targets. Please try again."
      actions={<button onClick={retry}>Try again</button>}
    />,
  );
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load your targets");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
