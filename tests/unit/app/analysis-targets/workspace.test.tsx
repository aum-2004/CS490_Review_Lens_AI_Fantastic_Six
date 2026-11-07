import { render, screen } from "@testing-library/react";
import { ProtectedTargetWorkspace } from "@/components/analysis-targets/ProtectedTargetWorkspace";
import { requirePageUser } from "@/services/auth/access-control";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { createSupabaseReviewStore } from "@/services/reviews/supabase-review-store";
import { getLatestAttempt } from "@/services/ingestion/ingestion-attempt-repository";

jest.mock("@/services/auth/access-control", () => ({ requirePageUser: jest.fn() }));
jest.mock("@/services/ingestion/ingestion-recovery", () => ({
  ingestionRecoveryConfigured: () => true,
}));
jest.mock("@/services/ingestion/ingestion-attempt-repository", () => ({
  ...jest.requireActual("@/services/ingestion/ingestion-attempt-repository"),
  getLatestAttempt: jest.fn(),
}));
jest.mock("@/services/ingestion/ingestion-runtime", () => ({
  ingestionEnabled: () => true,
  ingestionStorageApproved: () => true,
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/analysis-targets/target-ownership", () => ({
  ...jest.requireActual("@/services/analysis-targets/target-ownership"),
  getOwnedTargetOrThrow: jest.fn(),
}));
jest.mock("@/services/reviews/supabase-review-store", () => ({
  createSupabaseReviewStore: jest.fn(),
}));
jest.mock("@/components/shared/AccountMenu", () => ({ AccountMenu: () => <span>Account</span> }));
jest.mock("@/components/analysis-targets/RetryTargetsButton", () => ({
  RetryTargetsButton: () => <button>Try again</button>,
}));

const listReviews = jest.fn();
const params = Promise.resolve({ targetId: "owned-target" });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(requirePageUser).mockResolvedValue({ id: "verified-user", email: null });
  jest.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
  jest.mocked(getOwnedTargetOrThrow).mockResolvedValue({
    id: "owned-target",
    ownerId: "verified-user",
    name: "Bakery",
    platform: "google_maps",
    sourceUrl: "https://www.google.com/maps/place/Bakery",
    googlePlaceId: "ChIJSynthetic",
    createdAt: "2026-11-01T00:00:00Z",
  });
  jest.mocked(createSupabaseReviewStore).mockReturnValue({ listReviews } as never);
  listReviews.mockResolvedValue([]);
  jest.mocked(getLatestAttempt).mockResolvedValue(null);
});

afterEach(() => jest.restoreAllMocks());

it("opens an owned target with the shared shell, context, empty reviews and ingestion path", async () => {
  render(await ProtectedTargetWorkspace({ params }));
  expect(requirePageUser).toHaveBeenCalledWith("/analysis-targets/owned-target");
  expect(getOwnedTargetOrThrow).toHaveBeenCalledWith({}, "owned-target", "verified-user");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bakery");
  expect(screen.getByText("Google Maps", { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start ingestion" })).toBeEnabled();
  expect(screen.getByText(/No saved reviews yet/)).toBeInTheDocument();
  expect(screen.getAllByText("Not ingested")).toHaveLength(2);
  expect(screen.queryByText("Ingested", { exact: true })).not.toBeInTheDocument();
});

it("never labels unavailable status as no ingestion", async () => {
  jest.mocked(getLatestAttempt).mockRejectedValue(new Error("status database unavailable"));
  render(await ProtectedTargetWorkspace({ params }));
  expect(screen.queryByText("Not ingested")).not.toBeInTheDocument();
  expect(screen.getAllByText("Status unavailable")).toHaveLength(2);
});
it("shows the creation confirmation only after verifying the owned target", async () => {
  render(
    await ProtectedTargetWorkspace({ params, searchParams: Promise.resolve({ created: "1" }) }),
  );
  expect(screen.getByText("Target created. You can now start ingestion.")).toHaveAttribute(
    "class",
    "max-w-prose",
  );
  expect(getOwnedTargetOrThrow).toHaveBeenCalled();
});
it("does not let a creation marker disclose an unavailable target", async () => {
  jest.mocked(getOwnedTargetOrThrow).mockRejectedValue(new TargetNotFoundError());
  render(
    await ProtectedTargetWorkspace({ params, searchParams: Promise.resolve({ created: "1" }) }),
  );
  expect(
    screen.queryByText("Target created. You can now start ingestion."),
  ).not.toBeInTheDocument();
  expect(listReviews).not.toHaveBeenCalled();
  expect(getLatestAttempt).not.toHaveBeenCalled();
});

it("does not query protected data when authentication redirects", async () => {
  jest.mocked(requirePageUser).mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(ProtectedTargetWorkspace({ params })).rejects.toThrow("NEXT_REDIRECT");
  expect(createSupabaseServerClient).not.toHaveBeenCalled();
  expect(listReviews).not.toHaveBeenCalled();
});

it("denies unavailable targets before accessing reviews or rendering ingestion", async () => {
  jest.mocked(getOwnedTargetOrThrow).mockRejectedValue(new TargetNotFoundError());
  render(await ProtectedTargetWorkspace({ params }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "This target isn't available to your account",
  );
  expect(listReviews).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Start ingestion" })).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("Bakery");
});

it("keeps target context when reviews fail and does not misrepresent failure as an empty dataset", async () => {
  listReviews.mockRejectedValue(new Error("private SQL"));
  render(await ProtectedTargetWorkspace({ params }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bakery");
  expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load the saved reviews");
  expect(screen.queryByText(/No saved reviews yet/)).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("private SQL");
});

it("handles a target lookup failure safely with retry", async () => {
  jest.mocked(getOwnedTargetOrThrow).mockRejectedValue(new Error("private DB credentials"));
  render(await ProtectedTargetWorkspace({ params }));
  expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load this target");
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(listReviews).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain("private DB");
});
