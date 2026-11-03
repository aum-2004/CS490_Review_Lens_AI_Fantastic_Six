import { render, screen } from "@testing-library/react";

import NewAnalysisTargetPage from "@/app/analysis-targets/new/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe("NewAnalysisTargetPage", () => {
  it("renders the Create Target route structure", () => {
    render(<NewAnalysisTargetPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Create a new target" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Targets" })).toHaveAttribute(
      "href",
      "/analysis-targets",
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Target information" }),
    ).toBeInTheDocument();
  });
});
