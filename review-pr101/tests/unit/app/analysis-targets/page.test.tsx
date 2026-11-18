import { render, screen } from "@testing-library/react";
import { ProtectedAnalysisTargetsPage } from "@/components/analysis-targets/ProtectedAnalysisTargetsPage";
import { requirePageUser } from "@/services/auth/access-control";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAnalysisTargets } from "@/services/analysis-targets/list-analysis-targets";

jest.mock("@/services/auth/access-control", () => ({ requirePageUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/analysis-targets/list-analysis-targets", () => ({
  listAnalysisTargets: jest.fn(),
}));
jest.mock("@/components/shared/AccountMenu", () => ({ AccountMenu: () => <span>Account</span> }));
jest.mock("@/components/analysis-targets/RetryTargetsButton", () => ({
  RetryTargetsButton: () => <button>Try again</button>,
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(requirePageUser).mockResolvedValue({ id: "verified-owner", email: null });
  jest.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
  jest.mocked(listAnalysisTargets).mockResolvedValue([]);
});

it("loads only the guard's owner and renders the shared shell", async () => {
  render(await ProtectedAnalysisTargetsPage());
  expect(requirePageUser).toHaveBeenCalledWith("/analysis-targets");
  expect(listAnalysisTargets).toHaveBeenCalledWith({}, "verified-owner");
  expect(screen.getByRole("heading", { level: 1, name: "My Targets" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
    "href",
    "#main-content",
  );
  expect(screen.getByRole("heading", { name: "No targets yet" })).toBeInTheDocument();
});

it("propagates the guard's login redirect without loading data", async () => {
  jest.mocked(requirePageUser).mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(ProtectedAnalysisTargetsPage()).rejects.toThrow("NEXT_REDIRECT");
  expect(createSupabaseServerClient).not.toHaveBeenCalled();
  expect(listAnalysisTargets).not.toHaveBeenCalled();
});

it("shows a retryable safe error rather than an empty list or raw database details", async () => {
  jest.mocked(listAnalysisTargets).mockRejectedValue(new Error("private SQL and key"));
  render(await ProtectedAnalysisTargetsPage());
  expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load your targets");
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(screen.queryByText("No targets yet")).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("private SQL");
  expect(JSON.stringify(jest.mocked(console.error).mock.calls)).not.toContain("private SQL");
});
