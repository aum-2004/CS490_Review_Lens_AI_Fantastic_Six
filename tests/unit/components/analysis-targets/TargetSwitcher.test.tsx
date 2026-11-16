import { fireEvent, render, screen } from "@testing-library/react";
import { TargetSwitcher } from "@/components/analysis-targets/TargetSwitcher";

const activeTarget = {
  id: "a",
  name: "Bakery",
  sourceUrl: "https://www.google.com/maps/place/Bakery",
};

it("expands owned navigation, marks the active target once and closes after selection", () => {
  render(
    <TargetSwitcher
      activeTarget={activeTarget}
      targets={[
        activeTarget,
        { id: "b", name: "Cafe", sourceUrl: "https://www.google.com/maps/place/Cafe" },
      ]}
    />,
  );
  const button = screen.getByRole("button", { name: "Switch target" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  expect(screen.getAllByRole("link", { name: /^Bakery \(active\)/ })).toHaveLength(1);
  expect(screen.getByRole("link", { name: /^Bakery \(active\)/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const cafe = screen.getByRole("link", { name: /^Cafe / });
  expect(cafe).toHaveAttribute("href", "/analysis-targets/b");
  expect(cafe).not.toHaveAttribute("aria-current");
  fireEvent.click(cafe);
  expect(button).toHaveAttribute("aria-expanded", "false");
});

it("distinguishes duplicate names by source and treats target text as untrusted text", () => {
  const duplicate = {
    id: "b",
    name: "Bakery",
    sourceUrl: "https://www.google.com/maps/place/Other",
  };
  const untrusted = {
    id: "c",
    name: '<img src=x onerror="alert(1)">',
    sourceUrl: "javascript:alert(1)",
  };
  render(<TargetSwitcher activeTarget={activeTarget} targets={[duplicate, untrusted]} />);
  fireEvent.click(screen.getByRole("button", { name: "Switch target" }));
  expect(
    screen.getByRole("link", { name: `Bakery (active) ${activeTarget.sourceUrl}` }),
  ).toHaveAttribute("href", "/analysis-targets/a");
  expect(screen.getByRole("link", { name: `Bakery ${duplicate.sourceUrl}` })).toHaveAttribute(
    "href",
    "/analysis-targets/b",
  );
  const unsafeText = screen.getByRole("link", { name: `${untrusted.name} ${untrusted.sourceUrl}` });
  expect(unsafeText).toHaveAttribute("href", "/analysis-targets/c");
  expect(document.querySelector("img")).toBeNull();
  expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
});

it("closes with Escape and restores focus to the disclosure button", () => {
  render(<TargetSwitcher activeTarget={activeTarget} targets={[]} />);
  const button = screen.getByRole("button", { name: "Switch target" });
  fireEvent.keyDown(button, { key: "Escape" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(button);
  const link = screen.getByRole("link", { name: /^Bakery/ });
  link.focus();
  fireEvent.keyDown(link, { key: "ArrowDown" });
  expect(button).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(link, { key: "Escape" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(button).toHaveFocus();
});

it("explains when no other target is available and provides the complete list", () => {
  render(<TargetSwitcher activeTarget={activeTarget} targets={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Switch target" }));
  expect(screen.getByText("You have no other targets yet.")).toBeVisible();
  expect(screen.getByRole("link", { name: "View all targets" })).toHaveAttribute(
    "href",
    "/analysis-targets",
  );
});
