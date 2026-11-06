import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionPanel } from "@/components/auth/SessionPanel";
import { signOut } from "@/app/login/actions";

const refresh = jest.fn();
const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh, replace }) }));
jest.mock("@/app/login/actions", () => ({ signOut: jest.fn() }));
beforeEach(() => jest.resetAllMocks());

it("shows the verified email and navigates to login after successful logout", async () => {
  jest.mocked(signOut).mockResolvedValue({ success: true });
  render(<SessionPanel email="a@example.com" />);
  expect(screen.getByRole("status")).toHaveTextContent("a@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("keeps the signed-in state and allows retry after logout failure", async () => {
  jest
    .mocked(signOut)
    .mockResolvedValue({ success: false, message: "We couldn't sign you out. Please try again." });
  render(<SessionPanel email="a@example.com" />);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't sign you out");
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
});
