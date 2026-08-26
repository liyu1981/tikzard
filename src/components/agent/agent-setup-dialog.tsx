"use client";

import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { SettingsIcon, SparklesIcon, XIcon } from "@/components/agent/icons";
import { MarkdownView } from "@/components/agent/markdown";
import { getBundledSkills } from "@/lib/agent/skills";

/**
 * Agent Setup dialog, opened from the assistant panel header (the former
 * skills dropdown). Same card anatomy as the page-level settings dialog:
 * fixed-size glass card, vertical tab rail on the left, active panel on the
 * right so switching tabs never resizes the dialog.
 *
 * Tabs:
 * - System Prompt: the base prompt every new session receives (read-only
 *   preview, exactly what the model gets including the language directive).
 * - Skills: browser for the bundled SKILL.md files — names/descriptions on
 *   the left, the full instruction text on the right.
 */

type SetupTab = "prompt" | "skills";

function SystemPromptPanel() {
  const { t, i18n } = useTranslation();
  const language = i18n.language?.startsWith("zh") ? "Chinese" : "English";
  const prompt = t("agent.systemPrompt", { language });

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("agent.systemPromptHint")}
      </p>
      <pre className="max-h-[26rem] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border/40 bg-background/30 p-3 font-sans text-xs leading-relaxed">
        {prompt}
      </pre>
    </div>
  );
}

function SkillsPanel() {
  const { t } = useTranslation();
  const skills = getBundledSkills();
  const [selected, setSelected] = useState(skills[0]?.name ?? "");
  const active = skills.find((skill) => skill.name === selected) ?? skills[0];

  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* Left rail: one entry per bundled skill. */}
      <nav
        aria-label={t("agent.tabSkills")}
        className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto"
      >
        {skills.map((skill) => (
          <button
            key={skill.name}
            type="button"
            aria-pressed={active?.name === skill.name}
            onClick={() => setSelected(skill.name)}
            className={`flex flex-col items-stretch gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
              active?.name === skill.name
                ? "bg-primary/10"
                : "hover:bg-foreground/[0.05]"
            }`}
          >
            <span
              className={`truncate text-xs ${
                active?.name === skill.name
                  ? "font-semibold text-foreground"
                  : "font-medium text-foreground/90"
              }`}
            >
              /skill:{skill.name}
            </span>
            <span className="line-clamp-2 text-[0.65rem] leading-snug text-muted-foreground">
              {skill.description}
            </span>
          </button>
        ))}
      </nav>
      {/* Right pane: the selected skill's full instruction text. */}
      <div className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-border/40 bg-background/30 p-3">
        {active === undefined ? (
          <p className="text-xs text-muted-foreground">
            {t("agent.setupTitle")}
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
              {active.description}
            </p>
            <MarkdownView content={active.content} />
          </>
        )}
      </div>
    </div>
  );
}

const TABS: {
  id: SetupTab;
  labelKey: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "prompt", labelKey: "agent.tabSystemPrompt", Icon: SettingsIcon },
  { id: "skills", labelKey: "agent.tabSkills", Icon: SparklesIcon },
];

export function AgentSetupDialog({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SetupTab>("prompt");

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

  const hasSkills = getBundledSkills().length > 0;

  return (
    <>
      <button
        type="button"
        aria-label={t("agent.setupTitle")}
        title={t("agent.setupTitle")}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="rounded-lg p-1.5 text-foreground transition duration-150 hover:bg-foreground/[0.06] active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SparklesIcon className="size-4" />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
          >
            <div className="glass-dialog materialize flex h-[42rem] max-h-[calc(100dvh-2rem)] w-[58rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-clip-padding">
              <nav
                aria-label={t("agent.setupTitle")}
                className="flex w-36 shrink-0 flex-col gap-0.5 border-r border-border/40 p-2"
              >
                {TABS.filter((entry) => entry.id !== "skills" || hasSkills).map(
                  ({ id, labelKey, Icon }) => (
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
                  ),
                )}
              </nav>

              <div className="flex min-w-0 flex-1 flex-col">
                <header className="apple-panel flex shrink-0 items-center justify-between px-4 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <SparklesIcon className="size-4 text-muted-foreground" />
                    {t(
                      TABS.find((entry) => entry.id === tab)?.labelKey ??
                        "agent.setupTitle",
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
                    hidden={tab !== "prompt"}
                    role="tabpanel"
                    aria-label={t("agent.tabSystemPrompt")}
                  >
                    <SystemPromptPanel />
                  </div>
                  {tab === "skills" && hasSkills && (
                    <div
                      role="tabpanel"
                      aria-label={t("agent.tabSkills")}
                      className="h-full"
                    >
                      <SkillsPanel />
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
