import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

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
  const matchMedia = jest.fn().mockReturnValue({ matches: dark });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
  render(<ThemeToggle />);

  fireEvent.click(screen.getByRole("button", { name: "Toggle dark mode" }));

  expect(matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
  expect(document.documentElement).toHaveAttribute("data-theme", dark ? "light" : "dark");
  expect(localStorage.getItem("reviewlens-theme")).toBe(dark ? "light" : "dark");
});

it("switches an explicit choice both ways even when the system preference disagrees", () => {
  document.documentElement.dataset.theme = "light";
  const matchMedia = jest.fn().mockReturnValue({ matches: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
  render(<ThemeToggle />);
  const toggle = screen.getByRole("button", { name: "Toggle dark mode" });

  fireEvent.click(toggle);
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem("reviewlens-theme")).toBe("dark");
  fireEvent.click(toggle);
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(localStorage.getItem("reviewlens-theme")).toBe("light");
  expect(matchMedia).not.toHaveBeenCalled();
});

it("still changes the theme when the browser blocks storage", () => {
  document.documentElement.dataset.theme = "light";
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage blocked", "SecurityError");
  });
  render(<ThemeToggle />);

  fireEvent.click(screen.getByRole("button", { name: "Toggle dark mode" }));

  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
});
