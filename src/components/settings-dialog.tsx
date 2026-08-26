"use client";

import { atom, useAtomValue } from "jotai";
import Image from "next/image";
import { type ComponentType, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import tikzardLogo from "@/app/icon.svg";
import { AgentSettings } from "@/components/agent/agent-settings";
import {
  BotIcon,
  CheckIcon,
  GithubIcon,
  GlobeIcon,
  InfoIcon,
  PackageIcon,
  SettingsIcon,
  SparklesIcon,
  XIcon,
} from "@/components/agent/icons";
import { useTheme } from "@/components/theme-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Theme } from "@/lib/theme";
import { getMaxVersions, setMaxVersions } from "@/lib/versions";
import pkg from "../../package.json";

type SettingsTab = "ai" | "setup" | "system" | "storage" | "about";

/**
 * Shared request channel so controls outside this component (e.g. the page
 * footer) can open the dialog, optionally on a specific tab. The dialog
 * watches it and applies the request whenever a new one arrives.
 */
export const settingsRequestAtom = atom<{
  open: boolean;
  tab?: SettingsTab;
}>({ open: false });

const LANGUAGES = [
  { code: "en", native: "English" },
  { code: "zh", native: "简体中文" },
];

const THEME_OPTIONS: { value: Theme; labelKey: string }[] = [
  { value: "light", labelKey: "theme.light" },
  { value: "dark", labelKey: "theme.dark" },
  { value: "system", labelKey: "theme.system" },
];

/** Appearance picker: light / dark / follow-system. */
function ThemeSettings() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t("settings.themeLabel")}
      </p>
      <fieldset className="m-0 overflow-hidden rounded-xl border border-border/40 p-0">
        <legend className="sr-only">{t("settings.themeLabel")}</legend>
        {THEME_OPTIONS.map(({ value, labelKey }) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
            className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors ${
              value === "light" ? "" : "border-t border-border/40"
            } ${theme === value ? "bg-primary/10 font-medium" : "hover:bg-foreground/[0.05]"}`}
          >
            <span>{t(labelKey)}</span>
            {theme === value && (
              <CheckIcon className="size-4 shrink-0 text-primary" />
            )}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

function SystemSettings() {
  return (
    <div className="space-y-6">
      <ThemeSettings />
      <LanguageSettings />
    </div>
  );
}

function LanguageSettings() {
  const { t, i18n } = useTranslation();
  const active = i18n.language?.startsWith("zh") ? "zh" : "en";

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t("settings.languageLabel")}
      </p>
      <fieldset className="m-0 overflow-hidden rounded-xl border border-border/40 p-0">
        <legend className="sr-only">{t("settings.languageLabel")}</legend>
        {LANGUAGES.map(({ code, native }) => (
          <button
            key={code}
            type="button"
            aria-pressed={active === code}
            onClick={() => void i18n.changeLanguage(code)}
            className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors ${
              code === "en" ? "" : "border-t border-border/40"
            } ${active === code ? "bg-primary/10 font-medium" : "hover:bg-foreground/[0.05]"}`}
          >
            <span>{native}</span>
            {active === code && (
              <CheckIcon className="size-4 shrink-0 text-primary" />
            )}
          </button>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        {t("settings.languageHint")}
      </p>
    </div>
  );
}

function StorageSettings() {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(getMaxVersions()));

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const clamped = Math.max(1, Math.min(999, parsed));
    setValue(String(clamped));
    setMaxVersions(clamped);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t("settings.maxVersionsLabel")}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={999}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            commit(event.target.value);
          }}
          onBlur={(event) => commit(event.target.value)}
          aria-label={t("settings.maxVersionsLabel")}
          className="h-8 w-24 rounded-lg border border-border/50 bg-background/50 px-2 font-mono text-sm text-foreground tabular-nums outline-none transition duration-150 hover:brightness-[1.06] focus-visible:border-ring"
        />
        <span className="text-xs text-muted-foreground">
          {t("settings.maxVersionsHint")}
        </span>
      </div>
    </div>
  );
}

/**
 * Shows the base system prompt sent to the pi-agent in every new session.
 * The {{language}} placeholder is filled exactly as agent-chat does at
 * session creation, so this is the text the model actually receives.
 */
function AgentSetupPanel() {
  const { t, i18n } = useTranslation();
  const language = i18n.language?.startsWith("zh") ? "Chinese" : "English";
  const prompt = t("agent.systemPrompt", { language });

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("settings.agentSetupHint")}
      </p>
      <pre className="max-h-[26rem] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border/40 bg-background/30 p-3 font-sans text-xs leading-relaxed">
        {prompt}
      </pre>
    </div>
  );
}

function AboutPanel() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 text-center">
      {/* The artwork carries its own rounded-tile background and glow */}
      <Image
        src={tikzardLogo}
        alt=""
        draggable={false}
        className="size-64 shrink-0"
      />
      <div className="space-y-1.5">
        <p className="text-xl font-semibold tracking-wide">TikZard</p>
        <p className="inline-flex items-center rounded-md border border-border/40 bg-background/50 px-2 py-0.5 font-mono text-[0.65rem] tabular-nums text-muted-foreground">
          v{pkg.version}
        </p>
      </div>
      <div className="max-w-2xl space-y-1.5 rounded-xl border border-border/40 bg-background/30 p-3 text-xs leading-relaxed text-muted-foreground">
        <p>{t("settings.aboutBlurb")}</p>
        <p>{t("settings.aboutLocal")}</p>
        <p>{t("settings.aboutAgent")}</p>
      </div>
      <a
        href="https://github.com/liyu1981/tikzard"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98]"
      >
        <GithubIcon className="size-3.5" />
        GitHub
      </a>
    </div>
  );
}

/**
 * Page-level Settings dialog: a fixed-size card with a vertical tab rail on
 * the left (AI assistant / agent setup / system / storage / about) and the
 * active panel on the right, so switching tabs never resizes the dialog.
 * The trigger sits in the top-right controls of the header.
 */
export function SettingsDialog() {
  const { t } = useTranslation();
  const request = useAtomValue(settingsRequestAtom);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SettingsTab>("ai");

  // Apply open requests coming through the shared atom (footer link etc.).
  // A fresh object reference each set re-fires this even for the same tab.
  useEffect(() => {
    if (!request.open) {
      return;
    }
    setOpen(true);
    if (request.tab !== undefined) {
      setTab(request.tab);
    }
  }, [request]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const TABS: {
    id: SettingsTab;
    labelKey: string;
    Icon: ComponentType<{ className?: string }>;
  }[] = [
    { id: "ai", labelKey: "settings.tabAI", Icon: BotIcon },
    { id: "setup", labelKey: "settings.tabAgentSetup", Icon: SparklesIcon },
    { id: "system", labelKey: "settings.tabSystem", Icon: GlobeIcon },
    { id: "storage", labelKey: "settings.tabStorage", Icon: PackageIcon },
    { id: "about", labelKey: "settings.tabAbout", Icon: InfoIcon },
  ];

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("settings.title")}
            onClick={() => setOpen(true)}
            className="glass-control flex size-9 items-center justify-center rounded-full bg-clip-padding p-2 text-muted-foreground transition duration-150 hover:text-foreground active:scale-[0.95]"
          >
            <SettingsIcon className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t("settings.title")}</TooltipContent>
      </Tooltip>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
          >
            <div className="glass-dialog materialize flex h-[42rem] max-h-[calc(100dvh-2rem)] w-[58rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-clip-padding">
              <nav
                aria-label={t("settings.title")}
                className="flex w-36 shrink-0 flex-col gap-0.5 border-r border-border/40 p-2"
              >
                {TABS.map(({ id, labelKey, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      tab === id
                        ? "bg-primary/10 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{t(labelKey)}</span>
                  </button>
                ))}
              </nav>

              <div className="flex min-w-0 flex-1 flex-col">
                <header className="apple-panel flex shrink-0 items-center justify-between px-4 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <SettingsIcon className="size-4 text-muted-foreground" />
                    {t(
                      TABS.find((entry) => entry.id === tab)?.labelKey ??
                        "settings.title",
                    )}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={t("agent.close")}
                    className="rounded-lg p-1.5 text-muted-foreground transition duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.95]"
                  >
                    <XIcon className="size-4" />
                  </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div
                    hidden={tab !== "ai"}
                    role="tabpanel"
                    aria-label={t("settings.tabAI")}
                  >
                    <AgentSettings />
                  </div>
                  {tab === "setup" && (
                    <div
                      role="tabpanel"
                      aria-label={t("settings.tabAgentSetup")}
                    >
                      <AgentSetupPanel />
                    </div>
                  )}
                  {tab === "system" && (
                    <div role="tabpanel" aria-label={t("settings.tabSystem")}>
                      <SystemSettings />
                    </div>
                  )}
                  {tab === "storage" && (
                    <div role="tabpanel" aria-label={t("settings.tabStorage")}>
                      <StorageSettings />
                    </div>
                  )}
                  {tab === "about" && (
                    <div role="tabpanel" aria-label={t("settings.tabAbout")}>
                      <AboutPanel />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
