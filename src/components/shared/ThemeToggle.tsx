"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";

function darkModeEnabled() {
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark" || theme === "light") return theme === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeToTheme, darkModeEnabled, () => false);

  function toggle() {
    const root = document.documentElement;
    const next = darkModeEnabled() ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("reviewlens-theme", next);
    } catch {
      /* The theme still works without browser storage. */
    }
  }
  return (
    <Button
      variant="ghost"
      onClick={toggle}
      className="justify-start text-muted-foreground"
      aria-pressed={dark}
    >
      <Moon size={16} aria-hidden="true" className="theme-moon" />
      <Sun size={16} aria-hidden="true" className="theme-sun" />
      <span>Dark mode</span>
    </Button>
  );
}
