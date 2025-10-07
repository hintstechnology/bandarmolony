import React, { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

/**
 * Dropdown kecil: System / Light / Dark
 * - Klik opsi => setTheme + tutup menu
 * - Icon tombol menyesuaikan theme aktif
 * - Click outside utk menutup
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // icon di tombol - gunakan theme yang dipilih, bukan resolved
  const Icon =
    theme === "dark" ? Sun : theme === "light" ? Moon : Monitor;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        className="w-9 h-9 flex items-center justify-center rounded-md border border-border hover:bg-accent transition"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Theme"
      >
        <Icon className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-36 rounded-md border border-border bg-popover shadow-lg z-50 py-1"
        >
          <button
            role="menuitem"
            className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-sm ${
              theme === "system" ? "bg-accent" : ""
            }`}
            onClick={() => {
              setTheme("system");
              setOpen(false);
            }}
          >
            <Monitor className="w-4 h-4" /> System
          </button>
          <button
            role="menuitem"
            className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-sm ${
              theme === "light" ? "bg-accent" : ""
            }`}
            onClick={() => {
              setTheme("light");
              setOpen(false);
            }}
          >
            <Moon className="w-4 h-4" /> Light
          </button>
          <button
            role="menuitem"
            className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-sm ${
              theme === "dark" ? "bg-accent" : ""
            }`}
            onClick={() => {
              setTheme("dark");
              setOpen(false);
            }}
          >
            <Sun className="w-4 h-4" /> Dark
          </button>
        </div>
      )}
    </div>
  );
}
