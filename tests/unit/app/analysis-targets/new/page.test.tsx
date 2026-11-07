import { render, screen, within } from "@testing-library/react";

import { ProtectedNewAnalysisTargetPage } from "@/app/analysis-targets/new/page";
import { requirePageUser } from "@/services/auth/access-control";

jest.mock("@/services/auth/access-control", () => ({ requirePageUser: jest.fn() }));
jest.mock("@/app/login/actions", () => ({ signOut: jest.fn() }));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe("NewAnalysisTargetPage", () => {
  beforeEach(() => {
    jest.mocked(requirePageUser).mockReset();
    jest
      .mocked(requirePageUser)
      .mockResolvedValue({ id: "verified-user-a", email: "a@example.com" });
  });

  it("requires a verified page user with the safe return destination", async () => {
    render(await ProtectedNewAnalysisTargetPage());

    expect(requirePageUser).toHaveBeenCalledWith("/analysis-targets/new");

    expect(
      screen.getByRole("heading", { level: 1, name: "Create a new target" }),
    ).toBeInTheDocument();
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getByRole("link", { name: "My Targets" })).toHaveAttribute(
      "href",
      "/analysis-targets",
    );
    expect(within(breadcrumb).getByText("New Target")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New Target" })).toHaveAttribute(
      "href",
      "/analysis-targets/new",
    );
    expect(screen.getByRole("button", { name: /a@example\.com/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Target information" }),
    ).toBeInTheDocument();
  });

  it("does not render the form when the page guard redirects", async () => {
    jest.mocked(requirePageUser).mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(ProtectedNewAnalysisTargetPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(requirePageUser).toHaveBeenCalledWith("/analysis-targets/new");
  });
});
