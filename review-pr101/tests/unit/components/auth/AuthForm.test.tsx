import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AuthForm } from "@/components/auth/AuthForm";
import { register, signIn } from "@/app/login/actions";

const refresh = jest.fn();
const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh, replace }) }));
jest.mock("@/app/login/actions", () => ({ register: jest.fn(), signIn: jest.fn() }));
beforeEach(() => jest.resetAllMocks());

function enterCredentials() {
  fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "a@example.com" } });
  fireEvent.change(screen.getByLabelText("Password *"), { target: { value: " dummy-password " } });
}
function submit() {
  fireEvent.submit(screen.getByRole("form"));
}

it("labels required fields and validates before contacting the server", async () => {
  render(<AuthForm />);
  expect(screen.getByLabelText("Email *")).toHaveAttribute("aria-required", "true");
  submit();
  expect(await screen.findByText("Please fix the highlighted fields.")).toBeInTheDocument();
  expect(screen.getByLabelText("Email *")).toHaveAttribute("aria-invalid", "true");
  await waitFor(() => expect(screen.getByLabelText("Email *")).toHaveFocus());
  expect(signIn).not.toHaveBeenCalled();
});
it("shows a safe failed-login message and retains entered values", async () => {
  jest.mocked(signIn).mockResolvedValue({
    success: false,
    message: "We couldn't sign you in. Check your email and password and try again.",
  });
  render(<AuthForm />);
  enterCredentials();
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't sign you in");
  expect(screen.getByLabelText("Email *")).toHaveValue("a@example.com");
  expect(screen.getByLabelText("Password *")).toHaveValue(" dummy-password ");
  expect(refresh).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});
it("opens My Targets after successful login and clears the password", async () => {
  jest.mocked(signIn).mockResolvedValue({ success: true });
  render(<AuthForm />);
  enterCredentials();
  submit();
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(replace).toHaveBeenCalledWith("/analysis-targets");
  expect(screen.getByLabelText("Password *")).toHaveValue("");
  expect(signIn).toHaveBeenCalledWith({ email: "a@example.com", password: " dummy-password " });
});

it.each([
  ["/analysis-targets/new", "/analysis-targets/new"],
  ["https://example.com", "/analysis-targets"],
  ["//example.com", "/analysis-targets"],
  ["javascript:alert(1)", "/analysis-targets"],
  ["/login", "/analysis-targets"],
])("uses only an allowed post-login return destination %s", async (returnTo, destination) => {
  jest.mocked(signIn).mockResolvedValue({ success: true });
  render(<AuthForm returnTo={returnTo} />);
  enterCredentials();
  submit();
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(replace).toHaveBeenCalledWith(destination);
});
it("uses one form for registration and explains confirmation without claiming login", async () => {
  jest.mocked(register).mockResolvedValue({
    success: true,
    requiresConfirmation: true,
    message: "Check your email for a confirmation link.",
  });
  render(<AuthForm />);
  fireEvent.click(
    within(screen.getByRole("group", { name: "Account access" })).getByRole("button", {
      name: "Register",
    }),
  );
  expect(screen.getByLabelText("Password *")).toHaveAttribute("autocomplete", "new-password");
  enterCredentials();
  submit();
  expect(await screen.findByRole("status")).toHaveTextContent("Check your email");
  expect(register).toHaveBeenCalledTimes(1);
  expect(register).toHaveBeenCalledWith({ email: "a@example.com", password: " dummy-password " });
  expect(refresh).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});
it("opens My Targets when registration immediately establishes a session", async () => {
  jest.mocked(register).mockResolvedValue({ success: true });
  render(<AuthForm />);
  fireEvent.click(
    within(screen.getByRole("group", { name: "Account access" })).getByRole("button", {
      name: "Register",
    }),
  );
  enterCredentials();
  submit();
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/analysis-targets"));
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("maps server field errors into accessible fields", async () => {
  jest
    .mocked(signIn)
    .mockResolvedValue({ success: false, fieldErrors: { email: "Enter a valid email address." } });
  render(<AuthForm />);
  enterCredentials();
  submit();
  expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
  expect(screen.getByLabelText("Email *")).toHaveFocus();
});
it("disables actions while the request is pending", async () => {
  let finish!: (result: { success: boolean; message: string }) => void;
  jest.mocked(signIn).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<AuthForm />);
  enterCredentials();
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  submit();
  expect(await screen.findByRole("button", { name: "Signing in…" })).toBeDisabled();
  expect(screen.getByLabelText("Email *")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("Password *")).toHaveAttribute("type", "password");
  expect(screen.getByRole("button", { name: "Show password" })).toBeDisabled();
  expect(
    within(screen.getByRole("group")).getByRole("button", { name: "Register" }),
  ).toBeDisabled();
  finish({ success: false, message: "Please try again." });
  expect(await screen.findByRole("alert")).toHaveTextContent("Please try again");
  expect(screen.getByRole("button", { name: "Show password" })).toBeEnabled();
});
it("handles lost network requests without displaying raw errors", async () => {
  jest.mocked(signIn).mockRejectedValue(new Error("private-provider-details"));
  render(<AuthForm />);
  enterCredentials();
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "We couldn't reach the sign-in service",
  );
  expect(screen.queryByText(/private-provider-details/)).not.toBeInTheDocument();
});

function selectRegistration() {
  fireEvent.click(
    within(screen.getByRole("group", { name: "Account access" })).getByRole("button", {
      name: "Register",
    }),
  );
}

it("shows an accessible live checklist only for registration and reverses checks after deletion", () => {
  render(<AuthForm />);
  expect(screen.queryByRole("list", { name: "Password requirements" })).not.toBeInTheDocument();
  selectRegistration();
  const input = screen.getByLabelText("Password *");
  const list = screen.getByRole("list", { name: "Password requirements" });
  expect(list).toHaveAttribute("aria-live", "polite");
  const description = document.getElementById(input.getAttribute("aria-describedby")!);
  expect(description).toContainElement(list);
  const items = within(list).getAllByRole("listitem");
  expect(items).toHaveLength(5);
  for (const item of items) expect(item).toHaveTextContent(/^Not met:/);

  fireEvent.change(input, { target: { value: "abcdefgh" } });
  expect(items[0]).toHaveTextContent(/^Met:/);
  expect(items[1]).toHaveTextContent(/^Not met:/);
  expect(items[2]).toHaveTextContent(/^Met:/);
  expect(items[3]).toHaveTextContent(/^Not met:/);
  expect(items[4]).toHaveTextContent(/^Not met:/);

  fireEvent.change(input, { target: { value: "Abcdef1!" } });
  for (const item of items) expect(item).toHaveTextContent(/^Met:/);
  fireEvent.change(input, { target: { value: "bcdef1!" } });
  expect(items[0]).toHaveTextContent(/^Not met:/);
  expect(items[1]).toHaveTextContent(/^Not met:/);
  expect(items[2]).toHaveTextContent(/^Met:/);
  expect(items[3]).toHaveTextContent(/^Met:/);
  expect(items[4]).toHaveTextContent(/^Met:/);
});

it.each(["sign-in", "register"])(
  "shows and hides %s passwords without changing or submitting them",
  async (mode) => {
    render(<AuthForm />);
    if (mode === "register") selectRegistration();
    fireEvent.change(screen.getByLabelText("Email *"), {
      target: { value: "visibility@example.test" },
    });
    const input = screen.getByLabelText("Password *");
    const password = " Abcdef1! ";
    fireEvent.change(input, { target: { value: password } });
    expect(input).toHaveAttribute("type", "password");
    const show = screen.getByRole("button", { name: "Show password" });
    expect(show).toHaveAttribute("type", "button");
    await act(async () => {
      fireEvent.click(show);
    });
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue(password);
    expect(input).toHaveAttribute(
      "autocomplete",
      mode === "register" ? "new-password" : "current-password",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    });
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue(password);
    expect(signIn).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  },
);

it("clears and conceals passwords when switching modes and resets checklist state", () => {
  render(<AuthForm />);
  fireEvent.change(screen.getByLabelText("Password *"), { target: { value: "Abcdef1!" } });
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  selectRegistration();
  expect(screen.getByLabelText("Password *")).toHaveValue("");
  expect(screen.getByLabelText("Password *")).toHaveAttribute("type", "password");
  for (const item of within(
    screen.getByRole("list", { name: "Password requirements" }),
  ).getAllByRole("listitem")) {
    expect(item).toHaveTextContent(/^Not met:/);
  }
  fireEvent.change(screen.getByLabelText("Password *"), { target: { value: "Abcdef1!" } });
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  fireEvent.click(
    within(screen.getByRole("group", { name: "Account access" })).getByRole("button", {
      name: "Sign in",
    }),
  );
  expect(screen.getByLabelText("Password *")).toHaveValue("");
  expect(screen.getByLabelText("Password *")).toHaveAttribute("type", "password");
  expect(screen.queryByRole("list", { name: "Password requirements" })).not.toBeInTheDocument();
});

it("keeps requirement guidance connected alongside a server password error", async () => {
  jest.mocked(register).mockResolvedValue({
    success: false,
    fieldErrors: { password: "Choose a different password." },
  });
  render(<AuthForm />);
  selectRegistration();
  enterCredentials();
  submit();
  const error = await screen.findByRole("alert");
  const input = screen.getByLabelText("Password *");
  const descriptions = input
    .getAttribute("aria-describedby")!
    .split(" ")
    .map((id) => document.getElementById(id));
  expect(descriptions).toContain(error);
  expect(
    descriptions.some((element) =>
      element?.contains(screen.getByRole("list", { name: "Password requirements" })),
    ),
  ).toBe(true);
  expect(input).toHaveAttribute("aria-invalid", "true");
});
