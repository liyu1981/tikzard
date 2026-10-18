"use client";

import {
  makeTranslator,
  ReAgentComposer,
  ReAgentComposerAttach,
  ReAgentComposerAttachments,
  ReAgentComposerInput,
  ReAgentComposerRow,
  ReAgentComposerSelectionChip,
  ReAgentComposerStatus,
  ReAgentHeader,
  ReAgentMessageList,
  ReAgentModelPicker,
  ReAgentNewSessionButton,
  type ReAgentNotify,
  ReAgentProvider,
  ReAgentRoot,
  ReAgentSendButton,
  ReAgentSessionsView,
  ReAgentSessionTreeTrigger,
  ReAgentSettingsTrigger,
  ReAgentSettingsView,
  ReAgentThinkingPicker,
  type ReAgentTranslate,
  useReAgent,
} from "@liyu1981/reagent";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ensureAgentState } from "@/lib/agent/bootstrap";
import type { EditorMutationBridge } from "@/lib/agent/editor-mutations";
import { imageContentToFile } from "@/lib/agent/images";
import { buildTikzToolDescriptors, buildTikzTools } from "@/lib/agent/tools";
import { pushCompileLog } from "@/lib/compile-logs";
import { cn } from "@/lib/utils";
import { hasWebMcp, registerWebMcpTools } from "@/lib/webmcp";
import { pendingAnnotationAtom } from "@/lib/workbench-state";
import { MarkdownView } from "./markdown";

/** Namespace for all ReAgent-persisted state (keys, config, conversations). */
const STORAGE_PREFIX = "tikzard";

interface TikzAgentPanelProps {
  agentBridge: EditorMutationBridge;
  className?: string;
}

/** Track the resolved light/dark theme from the `.dark` class applyTheme sets. */
function useResolvedTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const read = () =>
      setTheme(
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/**
 * Consumes a preview annotation staged by the workbench (see
 * `pendingAnnotationAtom`) and drops it into ReAgent's composer: the prompt
 * text fills the input and the snapshot rides along as a vision attachment,
 * never sent automatically.
 */
function AnnotationStager() {
  const { t } = useTranslation();
  const { setInput, addFiles } = useReAgent();
  const [pending, setPending] = useAtom(pendingAnnotationAtom);

  useEffect(() => {
    if (pending === null) {
      return;
    }
    setInput(pending.promptText);
    const file = imageContentToFile(
      pending.content,
      t("agent.annotatedImageName"),
    );
    const transfer = new DataTransfer();
    transfer.items.add(file);
    void addFiles(transfer.files);
    setPending(null);
  }, [pending, setInput, addFiles, setPending, t]);

  return null;
}

/**
 * The ReAgent layout parts, arranged exactly like the package preset but
 * rendered by the host so {@link AnnotationStager} can live inside the
 * provider and reach the composer. Settings and conversation-tree views are
 * ReAgent's own.
 */
function TikzAgentChrome({ className }: { className?: string }) {
  const { view } = useReAgent();
  return (
    <ReAgentRoot
      data-surface="glass"
      className={cn(
        "glass-control-opaque flex h-full min-h-0 flex-col overflow-hidden rounded-xl",
        className,
      )}
    >
      {view === "settings" ? (
        <ReAgentSettingsView />
      ) : view === "sessions" ? (
        <ReAgentSessionsView />
      ) : (
        <>
          <ReAgentHeader>
            <ReAgentSessionTreeTrigger />
            <ReAgentNewSessionButton />
            <ReAgentSettingsTrigger />
          </ReAgentHeader>

          <ReAgentMessageList />

          <footer className="p-2">
            <ReAgentComposer>
              <ReAgentComposerSelectionChip />
              <ReAgentComposerAttachments />
              <ReAgentComposerInput />
              <ReAgentComposerRow>
                <ReAgentComposerAttach />
                <div className="flex items-center gap-1.5">
                  <ReAgentComposerStatus />
                  <ReAgentThinkingPicker />
                  <ReAgentModelPicker />
                  <ReAgentSendButton />
                </div>
              </ReAgentComposerRow>
            </ReAgentComposer>
          </footer>
        </>
      )}
      <AnnotationStager />
    </ReAgentRoot>
  );
}

/**
 * The AI assistant panel: ReAgent's chat, conversation tree and settings,
 * wired to the live TikZ workbench through the host tool descriptors, the
 * app theme/language, the markdown renderer and the bundled drawing skills.
 */
export function TikzAgentPanel({
  agentBridge,
  className,
}: TikzAgentPanelProps) {
  const { i18n } = useTranslation();
  const theme = useResolvedTheme();

  // When WebMCP is available (native or polyfilled), the tools are exposed on
  // `document.modelContext` and ReAgent auto-discovers them; otherwise fall
  // back to host-provided descriptors so the agent never loses its tools.
  const webmcpAvailable = useMemo(() => hasWebMcp(), []);
  const extraDescriptors = useMemo(
    () => (webmcpAvailable ? [] : buildTikzToolDescriptors(agentBridge)),
    [webmcpAvailable, agentBridge],
  );
  useEffect(() => {
    if (!webmcpAvailable) {
      return;
    }
    return registerWebMcpTools(buildTikzTools(agentBridge));
  }, [webmcpAvailable, agentBridge]);
  const fallback = useMemo(() => makeTranslator(), []);
  const translate = useCallback<ReAgentTranslate>(
    (key, vars) => {
      if (i18n.exists(key)) {
        return i18n.t(key, vars) as unknown as string;
      }
      return fallback(key, vars);
    },
    [i18n, fallback],
  );
  const notify = useCallback<ReAgentNotify>((message, level) => {
    pushCompileLog(level === "error" ? "error" : "info", message);
  }, []);

  // Migrate pre-ReAgent state once and seed the bundled drawing guides.
  useEffect(() => {
    ensureAgentState(STORAGE_PREFIX);
  }, []);

  const language = i18n.language?.startsWith("zh") ? "zh-CN" : "en";

  return (
    <ReAgentProvider
      storagePrefix={STORAGE_PREFIX}
      extraDescriptors={extraDescriptors}
      theme={theme}
      language={language}
      translate={translate}
      notify={notify}
      renderMarkdown={MarkdownView}
    >
      <TikzAgentChrome className={className} />
    </ReAgentProvider>
  );
}
