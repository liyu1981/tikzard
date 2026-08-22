"use client";

import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/theme-provider";
import type { Theme } from "@/lib/theme";

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

const OPTIONS: { value: Theme; labelKey: string; Icon: ComponentType }[] = [
  { value: "light", labelKey: "theme.light", Icon: SunIcon },
  { value: "dark", labelKey: "theme.dark", Icon: MoonIcon },
  { value: "system", labelKey: "theme.system", Icon: MonitorIcon },
];

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <fieldset
      aria-label={t("theme.label")}
      className="glass-control fixed top-4 right-4 z-20 m-0 flex gap-1 rounded-full bg-clip-padding p-1"
    >
      {OPTIONS.map(({ value, labelKey, Icon }) => (
        <button
          key={value}
          type="button"
          title={t(labelKey)}
          aria-label={t(labelKey)}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
          className={`rounded-full p-2 transition duration-150 hover:brightness-[1.06] active:scale-[0.95] ${
            theme === value
              ? "bg-white/15 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon />
        </button>
      ))}
    </fieldset>
  );
}
