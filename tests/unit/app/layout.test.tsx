import { runInNewContext } from "node:vm";
import RootLayout from "@/app/layout";

function initializationScript() {
  const layout = RootLayout({ children: null, params: Promise.resolve({}) });
  return layout.props.children[0].props.children.props.dangerouslySetInnerHTML.__html as string;
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

it.each(["light", "dark"])("the actual layout script restores a saved %s preference", (theme) => {
  const getItem = jest.fn().mockReturnValue(theme);

  runInNewContext(initializationScript(), { localStorage: { getItem }, document });

  expect(getItem).toHaveBeenCalledWith("reviewlens-theme");
  expect(document.documentElement).toHaveAttribute("data-theme", theme);
});

it.each([null, "", "system", "DARK", '<img src=x onerror="alert(1)">'])(
  "the layout leaves the system fallback intact for an invalid stored value: %s",
  (value) => {
    runInNewContext(initializationScript(), {
      localStorage: { getItem: () => value },
      document,
    });

    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(document.querySelector("img")).toBeNull();
  },
);

it("the layout leaves no data-theme when reading storage throws", () => {
  expect(() =>
    runInNewContext(initializationScript(), {
      localStorage: {
        getItem: () => {
          throw new DOMException("Storage blocked", "SecurityError");
        },
      },
      document,
    }),
  ).not.toThrow();

  expect(document.documentElement).not.toHaveAttribute("data-theme");
});

it("the layout leaves no data-theme when access to localStorage itself throws", () => {
  const context = Object.defineProperty({ document }, "localStorage", {
    get() {
      throw new DOMException("Storage unavailable", "SecurityError");
    },
  });

  expect(() => runInNewContext(initializationScript(), context)).not.toThrow();
  expect(document.documentElement).not.toHaveAttribute("data-theme");
});
