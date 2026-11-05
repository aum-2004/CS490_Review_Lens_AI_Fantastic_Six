import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AuthForm } from "@/components/auth/AuthForm";
import { register, signIn } from "@/app/login/actions";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
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
});
it("refreshes server-rendered identity after successful login and clears the password", async () => {
  jest.mocked(signIn).mockResolvedValue({ success: true });
  render(<AuthForm />);
  enterCredentials();
  submit();
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Password *")).toHaveValue("");
  expect(signIn).toHaveBeenCalledWith({ email: "a@example.com", password: " dummy-password " });
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
  expect(refresh).not.toHaveBeenCalled();
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
  submit();
  expect(await screen.findByRole("button", { name: "Signing in…" })).toBeDisabled();
  expect(screen.getByLabelText("Email *")).toHaveAttribute("readonly");
  expect(
    within(screen.getByRole("group")).getByRole("button", { name: "Register" }),
  ).toBeDisabled();
  finish({ success: false, message: "Please try again." });
  expect(await screen.findByRole("alert")).toHaveTextContent("Please try again");
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
