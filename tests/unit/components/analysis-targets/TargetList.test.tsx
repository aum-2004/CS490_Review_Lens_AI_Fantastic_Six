import { render, screen } from "@testing-library/react";
import { TargetList } from "@/components/analysis-targets/TargetList";

it("renders the designed empty state and creation action", () => {
  render(<TargetList targets={[]} />);
  expect(screen.getByRole("heading", { name: "No targets yet" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Create your first target" })).toHaveAttribute(
    "href",
    "/analysis-targets/new",
  );
});

it("renders stored names, platform, source and workspace links without interpreting markup", () => {
  const name = "<script>private fixture</script>";
  const sourceUrl = "https://www.google.com/maps/place/Fixture";
  const { container } = render(
    <TargetList
      targets={[
        { id: "target-a", name, sourceUrl, platform: "google_maps", createdAt: "2026-11-01" },
      ]}
    />,
  );
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(name);
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByText("Google Maps")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: sourceUrl })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  expect(screen.getByRole("link", { name: "Open " + name })).toHaveAttribute(
    "href",
    "/analysis-targets/target-a",
  );
});
