import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

function mockMedia(dark: boolean) {
  const media = { matches: dark, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  const matchMedia = jest
    .spyOn(window, "matchMedia")
    .mockReturnValue(media as unknown as MediaQueryList);
  return { media, matchMedia };
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

it.each([false, true])("uses the system preference before a choice is saved (dark: %s)", (dark) => {
  const { matchMedia } = mockMedia(dark);
  render(<ThemeToggle />);

  fireEvent.click(screen.getByRole("button", { name: "Dark mode" }));

  expect(matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
  expect(document.documentElement).toHaveAttribute("data-theme", dark ? "light" : "dark");
  expect(localStorage.getItem("reviewlens-theme")).toBe(dark ? "light" : "dark");
});

it("switches an explicit choice both ways even when the system preference disagrees", () => {
  document.documentElement.dataset.theme = "light";
  mockMedia(true);
  render(<ThemeToggle />);
  const toggle = screen.getByRole("button", { name: "Dark mode" });

  fireEvent.click(toggle);
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem("reviewlens-theme")).toBe("dark");
  fireEvent.click(toggle);
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(localStorage.getItem("reviewlens-theme")).toBe("light");
  expect(toggle).toHaveAccessibleName("Dark mode");
  expect(toggle).not.toHaveAttribute("aria-label");
});

it("still changes the theme when the browser blocks storage", () => {
  document.documentElement.dataset.theme = "light";
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage blocked", "SecurityError");
  });
  render(<ThemeToggle />);

  fireEvent.click(screen.getByRole("button", { name: "Dark mode" }));

  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
});

it("exposes its visible label and updates aria-pressed in both directions", async () => {
  mockMedia(false);
  render(<ThemeToggle />);
  const button = screen.getByRole("button", { name: "Dark mode", pressed: false });
  expect(button).not.toHaveAttribute("aria-label");

  await act(async () => {
    fireEvent.click(button);
  });
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(button).toHaveAccessibleName("Dark mode");
  await act(async () => {
    fireEvent.click(button);
  });
  expect(button).toHaveAttribute("aria-pressed", "false");
});

it("reflects system changes until an explicit choice takes precedence", () => {
  const { media } = mockMedia(false);
  render(<ThemeToggle />);
  const button = screen.getByRole("button", { name: "Dark mode" });
  const notify = media.addEventListener.mock.calls[0][1] as () => void;

  act(() => {
    media.matches = true;
    notify();
  });
  expect(button).toHaveAttribute("aria-pressed", "true");
  act(() => {
    document.documentElement.dataset.theme = "light";
    notify();
  });
  expect(button).toHaveAttribute("aria-pressed", "false");
  act(() => {
    media.matches = false;
    notify();
  });
  expect(button).toHaveAttribute("aria-pressed", "false");
});

it("keeps separate controls in sync and removes media subscriptions on unmount", async () => {
  const { media } = mockMedia(false);
  const { unmount } = render(
    <>
      <ThemeToggle />
      <ThemeToggle />
    </>,
  );
  const buttons = screen.getAllByRole("button", { name: "Dark mode" });

  await act(async () => {
    fireEvent.click(buttons[0]);
  });

  for (const button of buttons) expect(button).toHaveAttribute("aria-pressed", "true");
  unmount();
  expect(media.removeEventListener).toHaveBeenCalledTimes(2);
});
