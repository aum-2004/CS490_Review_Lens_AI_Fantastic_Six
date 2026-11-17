"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
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
      aria-label="Toggle dark mode"
    >
      <Moon size={16} aria-hidden="true" className="theme-moon" />
      <Sun size={16} aria-hidden="true" className="theme-sun" />
      <span className="theme-moon">Dark mode</span>
      <span className="theme-sun">Light mode</span>
    </Button>
  );
}
