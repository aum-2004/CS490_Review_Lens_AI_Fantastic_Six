import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import LoginPage from "@/app/login/page";
import { signIn } from "@/app/login/actions";
import { getAuthenticatedUser } from "@/services/auth/auth-service";

const replace = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
  useRouter: () => ({ replace, refresh }),
}));
jest.mock("next/server", () => ({ connection: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("@/app/login/actions", () => ({ signIn: jest.fn(), register: jest.fn() }));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(connection).mockResolvedValue(undefined);
  jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
  jest.mocked(redirect).mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

// Resolve the actual async child behind the page's Suspense boundary before DOM rendering.
// Jest cannot render async Server Components itself; browser tests cover Next's runtime.
async function loginView(params: { notice?: string; next?: string | string[] } = {}) {
  const shell = LoginPage({ searchParams: Promise.resolve(params) });
  const content = shell.props.children;
  return content.type(content.props);
}

it.each<{ next?: string | string[]; expected: string }>([
  { expected: "/analysis-targets" },
  { next: "/analysis-targets", expected: "/analysis-targets" },
  { next: "/analysis-targets/new?source=direct", expected: "/analysis-targets/new?source=direct" },
  {
    next: "/analysis-targets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    expected: "/analysis-targets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  },
  { next: "https://example.com", expected: "/analysis-targets" },
  { next: "//example.com", expected: "/analysis-targets" },
  { next: "javascript:alert(1)", expected: "/analysis-targets" },
  { next: "/login", expected: "/analysis-targets" },
  { next: "/analysis-targets-other", expected: "/analysis-targets" },
  { next: "/analysis-targets\n", expected: "/analysis-targets" },
  { next: ["/analysis-targets/new", "https://example.com"], expected: "/analysis-targets" },
])("redirects a verified signed-in login visit safely: %j", async ({ next, expected }) => {
  jest.mocked(getAuthenticatedUser).mockResolvedValue({ id: "verified-user", email: null });
  await expect(loginView({ next })).rejects.toThrow("NEXT_REDIRECT");
  expect(redirect).toHaveBeenCalledTimes(1);
  expect(redirect).toHaveBeenCalledWith(expected);
  expect(getAuthenticatedUser).toHaveBeenCalledTimes(1);
  expect(connection).toHaveBeenCalledTimes(1);
});

it("renders the actual sign-in form for an anonymous visitor", async () => {
  render(await loginView());
  expect(screen.getByRole("heading", { name: "ReviewLens AI" })).toBeInTheDocument();
  expect(screen.getByRole("form", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.getByText("Please sign in to continue.")).toBeInTheDocument();
  expect(screen.queryByText("Your account")).not.toBeInTheDocument();
  expect(redirect).not.toHaveBeenCalled();
});

it("preserves a signed-out visitor's valid return link through the rendered form", async () => {
  jest.mocked(signIn).mockResolvedValue({ success: true });
  const destination = "/analysis-targets/new?source=direct";
  render(await loginView({ next: destination }));
  fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "fixture@example.test" } });
  fireEvent.change(screen.getByLabelText("Password *"), { target: { value: "existing-password" } });
  fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("fails closed with safe feedback when identity verification is unavailable", async () => {
  jest.mocked(getAuthenticatedUser).mockRejectedValue(new Error("private-provider-diagnostic"));
  render(await loginView({ next: "/analysis-targets/new" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Authentication is temporarily unavailable.");
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("private-provider-diagnostic");
  expect(redirect).not.toHaveBeenCalled();
});

it("keeps expired-confirmation feedback on the signed-out form", async () => {
  render(await loginView({ notice: "confirmation-error" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "The link may have expired or already been used.",
  );
  expect(screen.getByRole("form", { name: "Sign in" })).toBeInTheDocument();
  expect(redirect).not.toHaveBeenCalled();
});

it("does not display arbitrary notice text", async () => {
  render(await loginView({ notice: "private-token-do-not-show" }));
  expect(screen.getByRole("form", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("private-token-do-not-show");
});
