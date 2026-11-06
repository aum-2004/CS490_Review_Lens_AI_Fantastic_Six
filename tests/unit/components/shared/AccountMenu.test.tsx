import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountMenu } from "@/components/shared/AccountMenu";
import { signOut } from "@/app/login/actions";

const refresh = jest.fn();
const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh, replace }) }));
jest.mock("@/app/login/actions", () => ({ signOut: jest.fn() }));
// Test the async action coordinator here; real Radix menu/focus behavior is
// exercised in the browser suite, not reproduced by these primitive stubs.
jest.mock("radix-ui", () => {
  function Wrapper({ children }: { children: ReactNode }) {
    return <>{children}</>;
  }
  return {
    DropdownMenu: {
      Root: Wrapper,
      Trigger: Wrapper,
      Portal: Wrapper,
      Content: Wrapper,
      Item: ({
        children,
        onSelect,
        disabled,
      }: {
        children: ReactNode;
        onSelect: () => void;
        disabled: boolean;
      }) => (
        <button onClick={onSelect} disabled={disabled}>
          {children}
        </button>
      ),
    },
  };
});
beforeEach(() => jest.resetAllMocks());

it("refreshes navigation after successful logout", async () => {
  jest.mocked(signOut).mockResolvedValue({ success: true });
  render(<AccountMenu email="fixture@example.com" />);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  expect(refresh).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  "shows safe retry feedback for logout failure (thrown: %s)",
  async (thrown) => {
    if (thrown) jest.mocked(signOut).mockRejectedValueOnce(new Error("private provider error"));
    else
      jest
        .mocked(signOut)
        .mockResolvedValueOnce({ success: false, message: "private provider error" });
    jest.mocked(signOut).mockResolvedValueOnce({ success: true });
    render(<AccountMenu email="fixture@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't sign you out. Please try again.",
    );
    expect(document.body.textContent).not.toContain("private provider error");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(refresh).toHaveBeenCalledTimes(1);
  },
);
