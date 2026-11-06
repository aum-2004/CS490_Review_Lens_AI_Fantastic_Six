import { render, screen } from "@testing-library/react";

import { ProtectedNewAnalysisTargetPage } from "@/app/analysis-targets/new/page";
import { requirePageUser } from "@/services/auth/access-control";

jest.mock("@/services/auth/access-control", () => ({ requirePageUser: jest.fn() }));

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
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
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
