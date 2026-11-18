import type { ReactElement, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import LoginPage from "@/app/login/page";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import { redirect } from "next/navigation";

jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("next/server", () => ({ connection: jest.fn().mockResolvedValue(undefined) }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/components/auth/AuthForm", () => ({
  AuthForm: ({ returnTo }: { returnTo: string | null }) => (
    <form aria-label="Sign in" data-return-to={returnTo} />
  ),
}));
jest.mock("@/components/auth/SessionPanel", () => ({
  SessionPanel: ({ email }: { email: string | null }) => <p role="status">{email}</p>,
}));

type SearchParams = { notice?: string; next?: string | string[] };

// Resolve the async server child inside the page's Suspense boundary before
// handing the resulting client-renderable tree to Testing Library.
async function resolvePage(searchParams: SearchParams = {}) {
  const page = LoginPage({ searchParams: Promise.resolve(searchParams) });
  const child = page.props.children as ReactElement<{ searchParams: Promise<SearchParams> }>;
  const renderAccount = child.type as (props: typeof child.props) => Promise<ReactNode>;
  return renderAccount(child.props);
}

beforeEach(() => {
  jest.clearAllMocks();
  delete document.documentElement.dataset.theme;
  localStorage.clear();
  jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
  jest.mocked(redirect).mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

it("offers the shared theme control alongside sign-in without changing its safe return path", async () => {
  render(await resolvePage({ next: "/analysis-targets" }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ReviewLens AI");
  expect(screen.getByRole("form", { name: "Sign in" })).toHaveAttribute(
    "data-return-to",
    "/analysis-targets",
  );
  document.documentElement.dataset.theme = "light";
  fireEvent.click(screen.getByRole("button", { name: "Dark mode" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem("reviewlens-theme")).toBe("dark");
  expect(redirect).not.toHaveBeenCalled();
});

it("keeps the theme control available when authentication is unavailable", async () => {
  jest.mocked(getAuthenticatedUser).mockRejectedValue(new Error("private provider detail"));
  render(await resolvePage());
  expect(screen.getByRole("alert")).toHaveTextContent("Authentication is temporarily unavailable");
  expect(screen.getByRole("button", { name: "Dark mode" })).toBeEnabled();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.queryByText("private provider detail")).not.toBeInTheDocument();
});

it("shows the signed-in account and the theme control when no return path is requested", async () => {
  jest
    .mocked(getAuthenticatedUser)
    .mockResolvedValue({ id: "verified-user", email: "a@example.com" });
  render(await resolvePage());
  expect(screen.getByRole("status")).toHaveTextContent("a@example.com");
  expect(screen.getByText("Your account")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark mode" })).toBeEnabled();
});

it("redirects a verified account only to a protected application route", async () => {
  jest.mocked(getAuthenticatedUser).mockResolvedValue({ id: "verified-user", email: null });
  await expect(resolvePage({ next: "/analysis-targets" })).rejects.toThrow("NEXT_REDIRECT");
  expect(redirect).toHaveBeenCalledWith("/analysis-targets");
});

it("rejects an external return URL and presents confirmation errors without removing sign-in", async () => {
  render(await resolvePage({ next: "https://outside.example", notice: "confirmation-error" }));
  expect(redirect).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Try signing in");
  expect(screen.getByRole("form", { name: "Sign in" })).not.toHaveAttribute("data-return-to");
  expect(screen.getByRole("button", { name: "Dark mode" })).toBeEnabled();
});
