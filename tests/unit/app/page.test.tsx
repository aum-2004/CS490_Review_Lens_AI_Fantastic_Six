import { render, screen, within } from "@testing-library/react";

import Home from "@/app/page";

describe("Home", () => {
  it("presents the operational ReviewLens application foundation", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "ReviewLens AI" })).toBeInTheDocument();
    expect(screen.getByText("Application foundation operational")).toBeInTheDocument();
    expect(screen.getByText(/keep each dataset private to its owner/i)).toBeInTheDocument();

    const applicationAreas = screen.getAllByRole("listitem");
    expect(applicationAreas).toHaveLength(3);

    for (const areaName of ["Frontend", "Backend", "Data"]) {
      expect(
        applicationAreas.some((area) =>
          within(area).queryByRole("heading", { level: 2, name: areaName }),
        ),
      ).toBe(true);
    }
  });
});
