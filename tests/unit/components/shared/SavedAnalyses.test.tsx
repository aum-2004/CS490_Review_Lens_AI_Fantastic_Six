import { fireEvent, render, screen, within } from "@testing-library/react";
import { AppShell } from "@/components/shared/AppShell";
import { Navigation } from "@/components/shared/Navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAnalysisTargets } from "@/services/analysis-targets/list-analysis-targets";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/analysis-targets/one",
  useRouter: () => ({ refresh }),
}));
jest.mock("@/app/login/actions", () => ({ signOut: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/analysis-targets/list-analysis-targets", () => ({
  listAnalysisTargets: jest.fn(),
}));

it("loads the sidebar with the verified owner and sends only identity and display name to navigation", async () => {
  const client = {} as never;
  jest.mocked(createSupabaseServerClient).mockResolvedValue(client);
  jest.mocked(listAnalysisTargets).mockResolvedValue([
    {
      id: "one",
      name: "Weekend cafe",
      sourceUrl: "https://www.google.com/maps/place/Cafe",
      platform: "google_maps",
      createdAt: "2026-11-25",
    },
  ]);
  const shell = await AppShell({
    userId: "verified-owner",
    email: "melissa@example.com",
    children: <p>Workspace</p>,
  });
  expect(listAnalysisTargets).toHaveBeenCalledWith(client, "verified-owner");
  const navigation = shell.props.children.find(
    (child: { type?: unknown }) => child?.type === Navigation,
  );
  expect(navigation.props.savedAnalyses).toEqual([{ id: "one", name: "Weekend cafe" }]);
  render(shell);
  const saved = screen.getByRole("navigation", { name: "Saved analyses" });
  expect(within(saved).getByRole("link", { name: "Weekend cafe" })).toHaveAttribute(
    "href",
    "/analysis-targets/one",
  );
  expect(saved).not.toHaveTextContent("https://");
});

it("shows a recoverable load error without database details", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(listAnalysisTargets).mockRejectedValue(new Error("private database details"));
  render(await AppShell({ userId: "owner", email: null, children: <p>Workspace</p> }));
  expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load your saved analyses.");
  expect(screen.queryByText(/private database/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(refresh).toHaveBeenCalledTimes(1);
  jest.restoreAllMocks();
});

it("offers creation when the owner has no saved analyses", () => {
  render(<Navigation email={null} savedAnalyses={[]} />);
  expect(screen.getByText(/No saved analyses yet/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Create target" })).toHaveAttribute(
    "href",
    "/analysis-targets/new",
  );
});

it("keeps duplicate names as separate identities, marks the active one, and escapes untrusted names", () => {
  const unsafe = "<img src=x onerror=alert(1)>";
  render(
    <Navigation
      email={null}
      savedAnalyses={[
        { id: "one", name: "Cafe" },
        { id: "two", name: "Cafe" },
        { id: "three", name: unsafe },
      ]}
    />,
  );
  const saved = screen.getByRole("navigation", { name: "Saved analyses" });
  const cafes = within(saved).getAllByRole("link", { name: "Cafe" });
  expect(cafes[0]).toHaveAttribute("aria-current", "page");
  expect(cafes[1]).not.toHaveAttribute("aria-current");
  expect(cafes[1]).toHaveAttribute("href", "/analysis-targets/two");
  expect(within(saved).getByRole("link", { name: unsafe })).toHaveTextContent(unsafe);
  expect(saved.querySelector("img")).toBeNull();
});
