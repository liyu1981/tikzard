"use client";

import type {
  Agent,
  AgentMessage,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import { useAtom, useAtomValue } from "jotai";
import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
} from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { buildAgent } from "@/lib/agent/agent";
import {
  COMPACT_THRESHOLD,
  ensureContextCapacity,
  measureContext,
  parseContextOverflow,
  storeObservedContextLimit,
} from "@/lib/agent/context";
import type { EditorMutationBridge } from "@/lib/agent/editor-mutations";
import {
  fileToImageContent,
  type ImageLoadFailure,
  imageContentToDataUrl,
  MAX_ATTACHMENT_IMAGES,
  supportsImageInput,
} from "@/lib/agent/images";
import {
  LOCAL_PROVIDER_ID,
  listAvailableModels,
  refreshModels,
  resolveModel,
} from "@/lib/agent/models";
import {
  formatSkillsForSystemPrompt,
  getBundledSkills,
} from "@/lib/agent/skills";
import {
  type AgentSession,
  deleteSession,
  listSessionsForDoc,
  saveSession,
} from "@/lib/agent/store";
import { buildAgentTools } from "@/lib/agent/tools";
import {
  COMPILE_FAILURE_PATTERN,
  type CompileLogEntry,
  compileLogsAtom,
  getLastCompileLogId,
} from "@/lib/compile-logs";
import { leftTabAtom, pendingAnnotationAtom } from "@/lib/workbench-state";
import { AgentSetupDialog } from "./agent-setup-dialog";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ImageIcon,
  LoaderIcon,
  MessageSquareIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  SquareIcon,
  TrashIcon,
  XIcon,
} from "./icons";
import { ImageLightbox } from "./image-lightbox";
import { MarkdownView } from "./markdown";

const LAST_MODEL_KEY = "agent.lastModel";
const LAST_THINKING_KEY = "agent.lastThinkingLevel";
const MAX_PROMPT_SOURCE_CHARS = 6000;
const THINKING_LEVELS: ThinkingLevel[] = ["off", "low", "medium", "high"];
/** Consecutive auto-fix retries before pausing and handing control back. */
const AUTO_FIX_MAX_ATTEMPTS = 3;
/** Failure log text is embedded in the auto message, truncated to this. */
const AUTO_FIX_LOG_CHARS = 4000;

interface ToolChip {
  id: string;
  name: string;
  label: string;
  status: "running" | "done" | "error";
  args?: Record<string, unknown>;
  result?: unknown;
}

/** An image staged in the composer, not yet sent with a message. */
interface AttachmentPreview {
  id: string;
  name: string;
  content: ImageContent;
}

interface AgentChatProps {
  bridge?: EditorMutationBridge | null;
  /**
   * Open document the conversation history belongs to. History is isolated
   * per document: switching docId detaches the live agent and swaps the
   * archive list. Null only in the transient state before the workbench
   * mints an id for a brand-new document.
   */
  docId: string | null;
  className?: string;
}

function readLastModel(): { providerId: string; modelId: string } | undefined {
  try {
    const raw = localStorage.getItem(LAST_MODEL_KEY);
    return raw === null
      ? undefined
      : (JSON.parse(raw) as { providerId: string; modelId: string });
  } catch {
    return undefined;
  }
}

/** Compact token count for the context indicator: 1234 -> "1.2k". */
function formatTokens(count: number): string {
  if (count >= 100000) {
    return `${Math.round(count / 1000)}k`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

/** Last thinking level the user picked, validated against known levels. */
function readLastThinking(): ThinkingLevel {
  try {
    const raw = localStorage.getItem(LAST_THINKING_KEY);
    return THINKING_LEVELS.includes(raw as ThinkingLevel)
      ? (raw as ThinkingLevel)
      : "low";
  } catch {
    return "low";
  }
}

function newId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function messageText(message: AgentMessage): string {
  if (message.role === "assistant") {
    return message.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n");
  }
  if (message.role === "user") {
    return typeof message.content === "string"
      ? message.content
      : message.content
          .filter((b) => b.type === "text")
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("\n");
  }
  return "";
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** User messages longer than this many words render folded by default. */
const USER_MSG_FOLD_WORDS = 100;

/**
 * Right-aligned user bubble. Renders any image blocks the message carries
 * as clickable thumbnails (full view opens in a new tab). Long messages
 * collapse to three lines with a show-more/show-less toggle; each bubble
 * owns its expanded state so transcript updates during streaming never
 * reset it.
 */
function UserMessageBubble({
  text,
  content,
}: {
  text: string;
  content?: string | (TextContent | ImageContent)[];
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const wordCount = text.trim().split(/\s+/).length;
  const fold = wordCount > USER_MSG_FOLD_WORDS;
  const images = (Array.isArray(content) ? content : []).filter(
    (b): b is ImageContent => (b as { type?: string }).type === "image",
  );
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] rounded-2xl bg-primary px-3 py-2 text-sm text-white">
        {images.length > 0 && (
          <div className="mb-1 flex flex-wrap justify-end gap-1">
            {images.map((img) => {
              const src = imageContentToDataUrl(img);
              return (
                <ImageLightbox
                  key={`${img.mimeType}-${img.data.length}-${img.data.slice(0, 24)}`}
                  src={src}
                  alt={t("agent.attachImage")}
                  className="max-h-32 rounded-lg border border-white/20 bg-white/10 object-contain"
                />
              );
            })}
          </div>
        )}
        {text !== "" && (
          <p
            className={`whitespace-pre-wrap break-words ${
              fold && !expanded ? "line-clamp-3" : ""
            }`}
          >
            {text}
          </p>
        )}
        {fold && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="mt-1 block text-xs font-medium text-white/75 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            {expanded ? t("agent.showLess") : t("agent.showMore")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Collapsible reasoning panel: live (spinner) while streaming, archived after. */
function ThinkingDisclosure({
  text,
  live = false,
}: {
  text: string;
  live?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-lg border border-border/40 px-2 py-1 text-xs font-normal text-muted-foreground transition-colors hover:bg-foreground/[0.05]"
      >
        {live ? (
          <LoaderIcon className="size-3 animate-spin" />
        ) : (
          <SparklesIcon className="size-3" />
        )}
        <span>{t("agent.reasoning")}</span>
        <ChevronDownIcon
          className={`size-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-1 rounded-lg border border-border/40 bg-background/30 p-2">
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground">
            {text !== "" ? text : "…"}
          </pre>
        </div>
      )}
    </div>
  );
}

function AgentChatBase({ bridge, docId, className }: AgentChatProps) {
  const { t, i18n } = useTranslation();
  const leftTab = useAtomValue(leftTabAtom);
  const compileLogs = useAtomValue(compileLogsAtom);
  const [pendingAnnotation, setPendingAnnotation] = useAtom(
    pendingAnnotationAtom,
  );

  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [toolChips, setToolChips] = useState<ToolChip[]>([]);
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(
    new Set(),
  );
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  /** What pressing send (or Enter) does: continue the current thread or
      open a fresh one for the message. Ctrl+Enter always forces "new". */
  const [sendMode, setSendMode] = useState<"current" | "new">("current");
  const [runError, setRunError] = useState<string | null>(null);

  const agentRef = useRef<Agent | null>(null);
  const latestRef = useRef<AgentSession | null>(null);
  const bridgeRef = useRef(bridge ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docIdRef = useRef(docId);
  const lastSeenLogIdRef = useRef(getLastCompileLogId());
  const autoFixChainRef = useRef(0);
  const pendingFailureRef = useRef<CompileLogEntry | null>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  useEffect(() => {
    bridgeRef.current = bridge ?? null;
  }, [bridge]);

  // The active session is the one the agent instance is bound to — null
  // until the user sends a message or clicks "+". Archives in the list must
  // never masquerade as it (badge, model selector, transient states).
  const activeId = latestRef.current?.id;
  const latest =
    activeId !== undefined
      ? sessions.find((s) => s.id === activeId)
      : undefined;

  const toolLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const tool of buildAgentTools()) {
      map.set(tool.name, tool.label);
    }
    return map;
  }, []);

  const patchLatest = useCallback((messages: AgentMessage[]) => {
    setSessions((prev) =>
      prev.map((s, i) => (i === prev.length - 1 ? { ...s, messages } : s)),
    );
  }, []);

  const persistSession = useCallback(
    async (sessionNow: AgentSession, messages: AgentMessage[]) => {
      const updated: AgentSession = {
        ...sessionNow,
        messages,
        updatedAt: Date.now(),
      };
      await saveSession(updated);
      setSessions((prev) =>
        [updated, ...prev.filter((s) => s.id !== updated.id)].sort(
          (a, b) => a.updatedAt - b.updatedAt,
        ),
      );
    },
    [],
  );

  const syncTranscript = useCallback(() => {
    if (agentRef.current !== null) {
      patchLatest([...agentRef.current.state.messages]);
    }
  }, [patchLatest]);

  const buildSystemPrompt = useCallback((base: string): string => {
    // Progressive disclosure: only skill names + descriptions live in the
    // prompt; full instructions arrive on-demand via the load_skill tool.
    const skillsBlock = formatSkillsForSystemPrompt(getBundledSkills());
    const source = bridgeRef.current?.getCode() ?? "";
    if (source.trim() === "") {
      return skillsBlock === "" ? base : `${base}\n\n${skillsBlock}`;
    }
    const excerpt =
      source.length > MAX_PROMPT_SOURCE_CHARS
        ? `${source.slice(0, MAX_PROMPT_SOURCE_CHARS)}\n…[truncated — use get_tikz_source for the full text]`
        : source;
    return [
      base,
      skillsBlock,
      `## Current JSXGraph source open in the workbench\n\`\`\`javascript\n${excerpt}\n\`\`\`\nWhen asked about the drawing, answer using this source. To edit it, use set_source with the complete updated source (it lands in the editor immediately and re-renders the board).`,
    ]
      .filter((part) => part !== "")
      .join("\n\n");
  }, []);

  const defaultModel = useCallback(():
    | { providerId: string; modelId: string }
    | undefined => {
    const available = listAvailableModels();
    const last = readLastModel();
    if (
      last !== undefined &&
      available.some(
        (m) => m.provider === last.providerId && m.model.id === last.modelId,
      )
    ) {
      return last;
    }
    const localFirst =
      available.find((m) => m.provider === LOCAL_PROVIDER_ID) ?? available[0];
    return localFirst !== undefined
      ? { providerId: localFirst.provider, modelId: localFirst.model.id }
      : undefined;
  }, []);

  /**
   * Auto-fix loop: when a compile failure lands in the log stream while the
   * assistant tab is open, feed the compiler output back to the agent as a
   * user message so it rethinks and resubmits the source itself. Capped at
   * AUTO_FIX_MAX_ATTEMPTS consecutive retries; a successful compile or a
   * manual user message resets the counter.
   */
  /**
   * Run a prompt with context-window management: before sending, compact the
   * transcript when it crosses COMPACT_THRESHOLD of the model's effective
   * window; if the provider still rejects with an overflow error, learn the
   * reported hard limit, compact against it, and retry once.
   */
  const promptGuarded = useCallback(
    async (instance: Agent, text: string, images?: ImageContent[]) => {
      await ensureContextCapacity(instance, (notice) =>
        console.log("[context]", notice),
      );
      try {
        await instance.prompt(text, images);
        return;
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        const overflow = parseContextOverflow(raw);
        if (overflow === null || !overflow.overflow) {
          throw err;
        }
        if (overflow.limit !== undefined) {
          storeObservedContextLimit(
            instance.state.model.provider,
            instance.state.model.id,
            overflow.limit,
          );
        }
        console.warn("[context]", t("agent.contextOverflowRetry"));
        await ensureContextCapacity(instance, (notice) =>
          console.log("[context]", notice),
        );
        // Retry on the compacted transcript; instance.prompt() appends the
        // original user text and attachments itself.
        await instance.prompt(text, images);
      }
    },
    [t],
  );

  /**
   * Auto-fix loop: when a render failure lands in the log stream while the
   * assistant tab is open, feed the error back to the agent as a user
   * message so it rethinks and resubmits the source itself. Capped at
   * AUTO_FIX_MAX_ATTEMPTS consecutive retries; a successful render or a
   * manual user message resets the counter.
   */
  const sendAutoFix = useCallback(
    async (entry: CompileLogEntry) => {
      if (streamingRef.current) {
        pendingFailureRef.current = entry;
        return;
      }
      const instance = agentRef.current;
      const sessionNow = latestRef.current;
      if (instance === null || sessionNow === null) {
        return;
      }
      autoFixChainRef.current += 1;
      if (autoFixChainRef.current > AUTO_FIX_MAX_ATTEMPTS) {
        setRunError(
          t("agent.autoFixLimitReached", { count: AUTO_FIX_MAX_ATTEMPTS }),
        );
        autoFixChainRef.current = 0;
        return;
      }
      const message = t("agent.autoFixMessage", {
        logs: entry.text.slice(0, AUTO_FIX_LOG_CHARS),
      });
      latestRef.current = sessionNow;
      instance.state.systemPrompt = buildSystemPrompt(sessionNow.systemPrompt);
      setStreaming(true);
      setRunError(null);
      try {
        await promptGuarded(instance, message);
        await persistSession(sessionNow, instance.state.messages);
      } catch (err) {
        setRunError(err instanceof Error ? err.message : String(err));
      } finally {
        setStreaming(false);
      }
    },
    [buildSystemPrompt, persistSession, promptGuarded, t],
  );

  const subscribeAgent = useCallback(
    (instance: Agent, sessionNow: AgentSession) => {
      instance.subscribe((event) => {
        if (
          agentRef.current !== instance ||
          latestRef.current?.id !== sessionNow.id
        ) {
          return;
        }
        switch (event.type) {
          case "agent_start":
            setStreaming(true);
            setRunError(null);
            break;
          case "message_start":
            if (event.message.role === "assistant") {
              setStreamingText("");
              setStreamingThinking("");
              setIsThinking(false);
            }
            syncTranscript();
            break;
          case "message_update": {
            const ev = event.assistantMessageEvent;
            if (ev.type === "text_delta") {
              setStreamingText((prev) => prev + ev.delta);
            } else if (ev.type === "thinking_delta") {
              setStreamingThinking((prev) => prev + ev.delta);
            } else if (ev.type === "thinking_start") {
              setIsThinking(true);
            } else if (ev.type === "thinking_end") {
              setIsThinking(false);
            }
            break;
          }
          case "message_end":
            syncTranscript();
            if (event.message.role === "assistant") {
              setStreamingText("");
              setIsThinking(false);
            }
            break;
          case "tool_execution_start":
            setToolChips((prev) => [
              ...prev,
              {
                id: event.toolCallId,
                name: event.toolName,
                label: toolLabels.get(event.toolName) ?? event.toolName,
                status: "running",
                args: event.args as Record<string, unknown> | undefined,
              },
            ]);
            break;
          case "tool_execution_end":
            setToolChips((prev) =>
              prev.map((chip) =>
                chip.id === event.toolCallId
                  ? {
                      ...chip,
                      status: event.isError
                        ? ("error" as const)
                        : ("done" as const),
                      result: event.result,
                    }
                  : chip,
              ),
            );
            break;
          case "agent_end":
            syncTranscript();
            setStreaming(false);
            setStreamingText("");
            setStreamingThinking("");
            setIsThinking(false);
            if (instance.state.errorMessage) {
              setRunError(instance.state.errorMessage);
            }
            void persistSession(
              latestRef.current ?? sessionNow,
              instance.state.messages,
            );
            setToolChips([]);
            setExpandedToolCalls(new Set());
            if (pendingFailureRef.current !== null) {
              const pending = pendingFailureRef.current;
              pendingFailureRef.current = null;
              window.setTimeout(() => void sendAutoFix(pending), 300);
            }
            break;
          default:
            break;
        }
      });
    },
    [persistSession, sendAutoFix, syncTranscript, toolLabels],
  );

  const buildForSession = useCallback(
    async (sessionNow: AgentSession): Promise<Agent> => {
      agentRef.current?.abort();
      const instance = buildAgent({
        providerId: sessionNow.providerId,
        modelId: sessionNow.modelId,
        systemPrompt: sessionNow.systemPrompt,
        thinkingLevel: sessionNow.thinkingLevel,
        messages: sessionNow.messages,
        sessionId: sessionNow.id,
        bridge: bridgeRef.current ?? undefined,
      });
      agentRef.current = instance;
      latestRef.current = sessionNow;
      subscribeAgent(instance, sessionNow);
      return instance;
    },
    [subscribeAgent],
  );

  const createNewSession =
    useCallback(async (): Promise<AgentSession | null> => {
      const model = defaultModel();
      if (model === undefined) {
        setRunError(t("agent.noModelsHint"));
        return null;
      }
      // Unreachable in practice: the workbench mints a doc id eagerly on
      // mount, before the chat UI can start a session. Refuse rather than
      // create an orphaned conversation no document will ever list.
      if (docIdRef.current === null) {
        return null;
      }
      agentRef.current?.abort();
      const now = Date.now();
      const base = t("agent.systemPrompt", {
        language: i18n.language?.startsWith("zh") ? "Chinese" : "English",
      });
      const next: AgentSession = {
        id: newId(),
        docId: docIdRef.current,
        title: t("agent.untitled"),
        providerId: model.providerId,
        modelId: model.modelId,
        thinkingLevel: readLastThinking(),
        systemPrompt: base,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      // Not persisted here: an untouched session would accumulate an empty
      // "Untitled" row on every page load. The record materializes on first
      // activity (message sent, or model/thinking changed) via persistSession.
      setSessions((prev) =>
        [...prev.filter((s) => s.id !== next.id), next].sort(
          (a, b) => a.updatedAt - b.updatedAt,
        ),
      );
      // Starting a fresh conversation folds every archive, so exactly one
      // thread — the new active one — renders expanded.
      setCollapsed(
        new Set(sessions.filter((s) => s.id !== next.id).map((s) => s.id)),
      );
      latestRef.current = next;
      await buildForSession(next);
      setStreaming(false);
      setStreamingText("");
      setStreamingThinking("");
      setToolChips([]);
      setRunError(null);
      return next;
    }, [buildForSession, defaultModel, i18n.language, sessions, t]);

  // One-time provider catalog refresh; per-document work lives in the
  // effect below so switching documents re-runs it.
  useEffect(() => {
    void refreshModels().catch(() => undefined);
  }, []);

  // Per-document isolation. Whenever the open document changes: detach the
  // live agent and transient UI, then load that document's conversations as
  // detached archives — none activated, none created (newest expanded for
  // reading). handleSend lazily starts a fresh session on the first message.
  useEffect(() => {
    let cancelled = false;
    docIdRef.current = docId;
    agentRef.current?.abort();
    agentRef.current = null;
    latestRef.current = null;
    pendingFailureRef.current = null;
    autoFixChainRef.current = 0;
    setStreaming(false);
    setStreamingText("");
    setStreamingThinking("");
    setIsThinking(false);
    setToolChips([]);
    setRunError(null);
    setAttachments([]);
    if (docId === null) {
      // No open document (transient before the workbench mints an id).
      setSessions([]);
      setCollapsed(new Set());
      return () => {
        cancelled = true;
      };
    }
    void listSessionsForDoc(docId).then((all) => {
      if (cancelled) {
        return;
      }
      const ascending = [...all].sort((a, b) => a.updatedAt - b.updatedAt);
      setSessions(ascending);
      setCollapsed(new Set(ascending.slice(0, -1).map((s) => s.id)));
    });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  // Stage an annotated snapshot handed over by the preview's annotate flow:
  // replace the draft text and attachments with it, but never auto-send.
  useEffect(() => {
    if (pendingAnnotation === null) {
      return;
    }
    setInput(pendingAnnotation.promptText);
    setAttachments([
      {
        id: pendingAnnotation.id,
        name: t("agent.annotatedImageName"),
        content: pendingAnnotation.content,
      },
    ]);
    setPendingAnnotation(null);
  }, [pendingAnnotation, setPendingAnnotation, t]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll whenever transient streaming output grows
  useEffect(() => {
    const el = scrollRef.current;
    if (el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [sessions, streamingText, streamingThinking, toolChips]);

  // React to render failures arriving in the shared log stream: only while
  // the assistant tab is open, and each failure entry is handled once.
  useEffect(() => {
    const fresh = compileLogs.filter(
      (entry) => entry.id > lastSeenLogIdRef.current,
    );
    const newest = compileLogs[compileLogs.length - 1];
    lastSeenLogIdRef.current = newest ? newest.id : lastSeenLogIdRef.current;
    if (fresh.length === 0) {
      return;
    }
    if (fresh.some((entry) => /Rendered in /.test(entry.text))) {
      autoFixChainRef.current = 0;
    }
    if (leftTab !== "assistant") {
      return;
    }
    const failure = fresh.find((entry) =>
      COMPILE_FAILURE_PATTERN.test(entry.text),
    );
    if (failure === undefined) {
      return;
    }
    void sendAutoFix(failure);
  }, [compileLogs, leftTab, sendAutoFix]);

  /**
   * Run one user turn end-to-end: lazily create the session, refresh the
   * effective system prompt, stream the reply, and persist. `titleOverride`
   * names the session on its first message when the raw text is not
   * human-friendly (e.g. a manually invoked skill's payload).
   */
  const runUserTurn = useCallback(
    async (text: string, titleOverride?: string, images?: ImageContent[]) => {
      let sessionNow = latestRef.current;
      if (sessionNow === null) {
        const created = await createNewSession();
        if (created === null) {
          return;
        }
        sessionNow = created;
      }
      const instance = agentRef.current;
      if (instance === null) {
        return;
      }
      latestRef.current = sessionNow;
      instance.state.systemPrompt = buildSystemPrompt(sessionNow.systemPrompt);
      autoFixChainRef.current = 0;
      setStreaming(true);
      setRunError(null);
      try {
        await promptGuarded(instance, text, images);
        if (sessionNow.title === t("agent.untitled")) {
          const source =
            titleOverride ?? (text !== "" ? text : t("agent.imageOnlyTitle"));
          const title = source.slice(0, 40) + (source.length > 40 ? "…" : "");
          await persistSession(
            { ...sessionNow, title },
            instance.state.messages,
          );
        }
      } catch (err) {
        setStreaming(false);
        setRunError(err instanceof Error ? err.message : String(err));
      }
    },
    [buildSystemPrompt, createNewSession, persistSession, promptGuarded, t],
  );

  const allModels = listAvailableModels();
  // Before any session exists, the selectors still surface the remembered
  // model/thinking preferences — what the next conversation will use. The
  // model is state (seeded from localStorage) so picking one rerenders the
  // controlled picker even without an active session.
  const [rememberedModel, setRememberedModel] = useState(() => readLastModel());
  const latestModelValue =
    latest !== undefined
      ? `${latest.providerId}::${latest.modelId}`
      : rememberedModel !== undefined
        ? `${rememberedModel.providerId}::${rememberedModel.modelId}`
        : undefined;
  const effectiveThinking = latest?.thinkingLevel ?? readLastThinking();
  const selectedModel = allModels.find(
    (m) => `${m.provider}::${m.model.id}` === latestModelValue,
  );
  /** Trigger label: provider leads, in bold, then the model name. */
  const selectedModelLabel =
    selectedModel !== undefined ? (
      <>
        <span className="font-semibold">{selectedModel.providerName}</span>
        {" · "}
        {selectedModel.model.name}
      </>
    ) : undefined;
  /** Whether the model that would send the next message accepts images. */
  const imagesSupported =
    selectedModel !== undefined && supportsImageInput(selectedModel.model);

  /** Live context-window usage of the active conversation (undefined while
      no session exists — there is nothing to measure yet). */
  const contextMeasure = useMemo(
    () =>
      selectedModel !== undefined && latest !== undefined
        ? measureContext(
            selectedModel.model,
            latest.systemPrompt ?? "",
            latest.messages,
          )
        : undefined,
    [selectedModel, latest],
  );

  /** Convert picked/pasted/dropped files into staged attachments, surfacing
      the first failure reason (i18n key) when anything is rejected. */
  const addImageFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (files === null || files.length === 0) {
        return;
      }
      const list = Array.from(files);
      void (async () => {
        const accepted: AttachmentPreview[] = [];
        const reasons = new Set<ImageLoadFailure>();
        let tooMany = false;
        for (const file of list) {
          if (accepted.length + attachments.length >= MAX_ATTACHMENT_IMAGES) {
            tooMany = true;
            break;
          }
          const result = await fileToImageContent(file);
          if (result.ok) {
            accepted.push({
              id: newId(),
              name: file.name,
              content: result.content,
            });
          } else {
            reasons.add(result.reason);
          }
        }
        if (accepted.length > 0) {
          setAttachments((prev) => [...prev, ...accepted]);
        }
        if (tooMany) {
          setRunError(
            t("agent.imageTooMany", { count: MAX_ATTACHMENT_IMAGES }),
          );
        } else if (reasons.size > 0) {
          setRunError(t(`agent.image.${reasons.values().next().value}`));
        }
      })();
    },
    [attachments.length, t],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      addImageFiles(event.target.files);
      event.target.value = "";
    },
    [addImageFiles],
  );

  const handleComposerPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const data = event.clipboardData;
      if (data.files.length > 0) {
        event.preventDefault();
        addImageFiles(data.files);
        return;
      }
      // Screenshot tools and some clipboard sources (Linux/Wayland
      // managers, web-page copies) expose the image only as a clipboard
      // item, leaving .files empty — collect those blobs directly.
      const files = Array.from(data.items)
        .filter(
          (item) => item.kind === "file" && item.type.startsWith("image/"),
        )
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (files.length > 0) {
        event.preventDefault();
        addImageFiles(files);
      }
    },
    [addImageFiles],
  );

  const handleComposerDrop = useCallback(
    (event: DragEvent<HTMLFormElement>) => {
      event.preventDefault();
      addImageFiles(event.dataTransfer.files);
    },
    [addImageFiles],
  );

  const handleSend = useCallback(
    async (sendInNewChat = false) => {
      const text = input.trim();
      const images = attachments.map((a) => a.content);
      if ((text === "" && images.length === 0) || streaming) {
        return;
      }
      if (images.length > 0 && !imagesSupported) {
        setRunError(t("agent.imageModelNoVision"));
        return;
      }
      setInput("");
      setAttachments([]);
      if (sendInNewChat) {
        const created = await createNewSession();
        if (created === null) {
          return;
        }
      }
      await runUserTurn(
        text,
        undefined,
        images.length > 0 ? images : undefined,
      );
    },
    [
      createNewSession,
      attachments,
      imagesSupported,
      input,
      runUserTurn,
      streaming,
      t,
    ],
  );

  const handleStop = useCallback(() => {
    agentRef.current?.abort();
  }, []);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      const remaining = sessions.filter((s) => s.id !== id);
      await deleteSession(id);
      setSessions(remaining);
      if (id === latestRef.current?.id) {
        // Deleted the active conversation: detach instead of promoting an
        // archive, so no prior transcript ever becomes live context. The
        // aborted run's agent_end is rejected by the subscriber guard, so
        // clear its transient UI state here.
        agentRef.current?.abort();
        agentRef.current = null;
        latestRef.current = null;
        setStreaming(false);
        setStreamingText("");
        setStreamingThinking("");
        setIsThinking(false);
        setToolChips([]);
        setRunError(null);
      }
    },
    [sessions],
  );

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const changeModel = useCallback(
    (providerId: string, modelId: string) => {
      localStorage.setItem(
        LAST_MODEL_KEY,
        JSON.stringify({ providerId, modelId }),
      );
      // The picker is fully controlled, so the remembered choice must live in
      // state: before a session exists this is the only thing that rerenders
      // the selector (localStorage alone would snap the highlight back).
      setRememberedModel({ providerId, modelId });
      const instance = agentRef.current;
      if (instance !== null && latestRef.current !== null) {
        const model = resolveModel(providerId, modelId);
        if (model !== undefined) {
          instance.state.model = model;
        }
        const next = { ...latestRef.current, providerId, modelId };
        latestRef.current = next;
        void persistSession(next, instance.state.messages);
      }
    },
    [persistSession],
  );

  const changeThinking = useCallback(
    (level: ThinkingLevel) => {
      // Remembered across sessions and reloads, like the model choice; the
      // live agent instance only updates when a conversation is active.
      localStorage.setItem(LAST_THINKING_KEY, level);
      const instance = agentRef.current;
      if (instance !== null && latestRef.current !== null) {
        instance.state.thinkingLevel = level;
        const next = { ...latestRef.current, thinkingLevel: level };
        latestRef.current = next;
        void persistSession(next, instance.state.messages);
      }
    },
    [persistSession],
  );

  const [modelQuery, setModelQuery] = useState("");
  const normalizedQuery = modelQuery.trim().toLowerCase();
  const filteredModels =
    normalizedQuery === ""
      ? allModels
      : allModels.filter((m) =>
          `${m.model.id} ${m.model.name} ${m.providerName}`
            .toLowerCase()
            .includes(normalizedQuery),
        );
  const exactMatch =
    normalizedQuery !== "" &&
    allModels.some((m) => m.model.id.toLowerCase() === normalizedQuery);

  const toggleToolCall = useCallback((id: string) => {
    setExpandedToolCalls((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Send (and its mode chevron) is inert until there is something to send
      and a provider to send it to. */
  const sendDisabled =
    (input.trim() === "" && attachments.length === 0) || allModels.length === 0;

  const iconBtn =
    "rounded-lg p-1.5 text-muted-foreground transition duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.95]";

  const iconBtnStrong =
    "rounded-lg p-1.5 text-foreground transition duration-150 hover:bg-foreground/[0.06] active:scale-[0.95]";

  const renderMessage = (
    message: AgentMessage,
    index: number,
    allMessages?: AgentMessage[],
  ) => {
    if (message.role === "user") {
      return (
        <UserMessageBubble
          key={index}
          text={messageText(message)}
          content={message.content}
        />
      );
    }
    if (message.role === "toolResult") {
      return null;
    }
    if (message.role !== "assistant") {
      return null;
    }
    const text = messageText(message);
    const calledTools = message.content.filter((b) => b.type === "toolCall");
    const thinkingText = message.content
      .filter((b) => b.type === "thinking" && !b.redacted)
      .map((b) => (b.type === "thinking" ? b.thinking : ""))
      .join("\n\n");
    if (text === "" && calledTools.length === 0 && thinkingText === "") {
      return null;
    }

    const toolResultMap = new Map<string, AgentMessage>();
    if (allMessages) {
      for (const m of allMessages) {
        if (m.role === "toolResult") {
          toolResultMap.set(m.toolCallId, m);
        }
      }
    }

    return (
      <div key={index} className="flex items-start gap-2">
        <div className="glass-control mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-clip-padding">
          <BotIcon className="size-3.5 text-foreground" />
        </div>
        <div className="min-w-0 max-w-[88%] space-y-1.5">
          {thinkingText !== "" && <ThinkingDisclosure text={thinkingText} />}
          {text !== "" && (
            <div className="glass-control rounded-2xl bg-clip-padding px-3 py-2">
              <MarkdownView content={text} />
            </div>
          )}
          {calledTools.map((call, i) => {
            const expanded = expandedToolCalls.has(call.id);
            const resultMsg = toolResultMap.get(call.id);
            const hasDetails = resultMsg !== undefined;
            return (
              <div key={call.id ?? i}>
                <button
                  type="button"
                  onClick={
                    hasDetails ? () => toggleToolCall(call.id) : undefined
                  }
                  className={`flex items-center gap-1 rounded-lg border border-border/40 px-2 py-1 text-xs font-normal ${hasDetails ? "cursor-pointer transition-colors hover:bg-foreground/[0.05]" : ""}`}
                >
                  <SparklesIcon className="size-3" />
                  <span>
                    {t("agent.usedTool", {
                      tool: toolLabels.get(call.name) ?? call.name,
                    })}
                  </span>
                  {hasDetails && (
                    <ChevronDownIcon
                      className={`size-3 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  )}
                </button>
                {expanded &&
                  hasDetails &&
                  resultMsg !== undefined &&
                  resultMsg.role === "toolResult" && (
                    <div className="mt-1 space-y-1 rounded-lg border border-border/40 bg-background/30 p-2 text-xs">
                      <div>
                        <span className="font-medium text-muted-foreground">
                          {t("agent.toolArgs")}:
                        </span>
                        <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-foreground/80">
                          {JSON.stringify(call.arguments, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">
                          {resultMsg.isError
                            ? t("agent.toolError")
                            : t("agent.toolResult")}
                          :
                        </span>
                        <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-foreground/80">
                          {resultMsg.content
                            .map((b) =>
                              b.type === "text" ? b.text : "[image]",
                            )
                            .join("\n")}
                        </pre>
                      </div>
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`glass-control flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-clip-padding ${className ?? ""}`}
    >
      <header className="apple-panel flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <BotIcon className="size-4 text-foreground" />
          {t("agent.title")}
        </span>
        <div className="flex items-center gap-0.5">
          <AgentSetupDialog disabled={streaming} />
          <button
            type="button"
            onClick={() => void createNewSession()}
            aria-label={t("agent.newChat")}
            title={t("agent.newChat")}
            className={iconBtnStrong}
          >
            <PlusIcon className="size-4" />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2"
      >
        {sessions.length === 0 && allModels.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1.5 px-3 py-8 text-center">
            <BotIcon className="size-5 text-foreground" />
            <p className="text-xs text-foreground">{t("agent.noModelsHint")}</p>
          </div>
        )}
        {sessions.map((s) => {
          const isActive = s.id === activeId;
          const isCollapsed = collapsed.has(s.id);
          return (
            <div
              key={s.id}
              className="overflow-hidden rounded-xl border border-border/30 bg-background"
            >
              <div className="flex items-center gap-1 border-b border-border/30 p-1.5 pr-2">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(s.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-foreground/[0.05]"
                  aria-expanded={!isCollapsed}
                >
                  <ChevronDownIcon
                    className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                  />
                  <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs font-medium">
                    {s.title}
                  </span>
                  {isActive && (
                    <span className="shrink-0 rounded-full border border-border/50 px-1.5 py-px text-[0.65rem] text-muted-foreground">
                      {t("agent.active")}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[0.65rem] text-muted-foreground tabular-nums">
                    {formatTime(s.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteSession(s.id)}
                  aria-label={t("agent.deleteChat")}
                  title={t("agent.deleteChat")}
                  className={iconBtn}
                >
                  <TrashIcon className="size-3" />
                </button>
              </div>
              {!isCollapsed && (
                <div className="space-y-2.5 p-2">
                  {s.messages.length === 0 && !isActive && (
                    <p className="px-1 text-xs text-muted-foreground">
                      {t("agent.noMessages")}
                    </p>
                  )}
                  {s.messages.map((msg, i) =>
                    renderMessage(msg, i, s.messages),
                  )}
                  {isActive &&
                    (isThinking || streamingThinking !== "") &&
                    streamingText === "" && (
                      <div className="min-w-0 max-w-[88%]">
                        <ThinkingDisclosure
                          text={streamingThinking}
                          live={isThinking}
                        />
                      </div>
                    )}
                  {isActive && streamingText !== "" && (
                    <div className="flex items-start gap-2">
                      <div className="glass-control mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-clip-padding">
                        <BotIcon className="size-3.5 text-foreground" />
                      </div>
                      <div className="min-w-0 max-w-[88%] rounded-2xl border border-border/40 bg-background/40 px-3 py-2">
                        <pre className="whitespace-pre-wrap font-sans text-sm">
                          {streamingText}
                        </pre>
                      </div>
                    </div>
                  )}
                  {isActive && toolChips.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {toolChips.map((chip) => {
                        const expanded = expandedToolCalls.has(chip.id);
                        const hasDetails = chip.args !== undefined;
                        return (
                          <div key={chip.id}>
                            <button
                              type="button"
                              onClick={
                                hasDetails
                                  ? () => toggleToolCall(chip.id)
                                  : undefined
                              }
                              className={`flex items-center gap-1 rounded-lg border border-border/40 bg-background/30 px-2 py-1 text-xs ${hasDetails ? "cursor-pointer transition-colors hover:bg-foreground/[0.05]" : ""}`}
                            >
                              {chip.status === "running" && (
                                <LoaderIcon className="size-3 animate-spin" />
                              )}
                              {chip.status === "done" && (
                                <CheckIcon className="size-3" />
                              )}
                              {chip.status === "error" && (
                                <XIcon className="size-3 text-red-500" />
                              )}
                              <span>{chip.label}</span>
                              {hasDetails && (
                                <ChevronDownIcon
                                  className={`size-3 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                                />
                              )}
                            </button>
                            {expanded && hasDetails && (
                              <div className="mt-1 space-y-1 rounded-lg border border-border/40 bg-background/30 p-2 text-xs">
                                {chip.args !== undefined && (
                                  <div>
                                    <span className="font-medium text-muted-foreground">
                                      {t("agent.toolArgs")}:
                                    </span>
                                    <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-foreground/80">
                                      {JSON.stringify(chip.args, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {chip.result !== undefined && (
                                  <div>
                                    <span className="font-medium text-muted-foreground">
                                      {t("agent.toolResult")}:
                                    </span>
                                    <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-foreground/80">
                                      {typeof chip.result === "string"
                                        ? chip.result
                                        : JSON.stringify(chip.result, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isActive && runError !== null && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
                      {t("agent.errorPrefix")} {runError}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <footer className="space-y-1.5 border-t border-border/40 p-2">
        <div className="flex items-end gap-1.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <label
              htmlFor="agent-model-select"
              className="pl-0.5 text-[0.65rem] font-medium text-muted-foreground"
            >
              {t("agent.modelField")}
            </label>
            <DropdownMenu
              onOpenChange={(open) => {
                if (!open) {
                  setModelQuery("");
                }
              }}
            >
              <DropdownMenuTrigger
                id="agent-model-select"
                disabled={allModels.length === 0}
                aria-label={t("agent.selectModelPlaceholder")}
                className="flex h-8 min-w-0 w-full items-center justify-between gap-1 rounded-lg border border-border/50 bg-background/50 px-2 text-left text-xs outline-none transition duration-150 hover:brightness-[1.06] focus-visible:border-ring aria-expanded:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="truncate">
                  {selectedModelLabel ?? t("agent.selectModelPlaceholder")}
                </span>
                <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) text-xs">
                <div className="p-1">
                  <input
                    value={modelQuery}
                    onChange={(event) => setModelQuery(event.target.value)}
                    placeholder={t("agent.searchModelPlaceholder")}
                    aria-label={t("agent.searchModelPlaceholder")}
                    className="h-7 w-full rounded-md border border-border/50 bg-background/60 px-2 text-xs outline-none focus-visible:border-ring"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <DropdownMenuRadioGroup
                    value={latestModelValue ?? ""}
                    onValueChange={(value) => {
                      const [providerId, modelId] = value.split("::", 2);
                      if (providerId !== undefined && modelId !== undefined) {
                        changeModel(providerId, modelId);
                        setModelQuery("");
                      }
                    }}
                  >
                    {filteredModels.map((m) => (
                      <DropdownMenuRadioItem
                        key={`${m.provider}::${m.model.id}`}
                        value={`${m.provider}::${m.model.id}`}
                      >
                        <span className="font-semibold">{m.providerName}</span>
                        {" · "}
                        {m.model.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {normalizedQuery !== "" && !exactMatch && (
                    <button
                      type="button"
                      onClick={() => {
                        const providerId = latest?.providerId ?? "openrouter";
                        changeModel(providerId, modelQuery.trim());
                        setModelQuery("");
                      }}
                      className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-foreground/[0.06]"
                    >
                      {t("agent.useCustomModel", { model: modelQuery.trim() })}
                    </button>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex w-24 shrink-0 flex-col gap-0.5">
            <label
              htmlFor="agent-thinking-select"
              className="pl-0.5 text-[0.65rem] font-medium text-muted-foreground"
            >
              {t("agent.thinkingLevelField")}
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger
                id="agent-thinking-select"
                aria-label={t("agent.thinkingLevelField")}
                className="flex h-8 min-w-0 w-full items-center justify-between gap-1 rounded-lg border border-border/50 bg-background/50 px-2 text-left text-xs outline-none transition duration-150 hover:brightness-[1.06] focus-visible:border-ring aria-expanded:brightness-110"
              >
                <span className="truncate">
                  {t(`agent.level.${effectiveThinking}`)}
                </span>
                <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-(--radix-dropdown-menu-trigger-width) text-xs"
              >
                <DropdownMenuRadioGroup
                  value={effectiveThinking}
                  onValueChange={(value) =>
                    changeThinking(value as ThinkingLevel)
                  }
                >
                  {THINKING_LEVELS.map((level) => (
                    <DropdownMenuRadioItem key={level} value={level}>
                      {t(`agent.level.${level}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {contextMeasure !== undefined && (
            <div className="flex w-32 shrink-0 flex-col gap-0.5">
              <span className="pl-0.5 text-[0.65rem] font-medium text-muted-foreground">
                {t("agent.contextField")}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    id="agent-context-usage"
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2 text-xs outline-none transition duration-150 hover:brightness-[1.06] focus-visible:border-ring aria-expanded:brightness-110"
                  >
                    <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className={`h-full transition-[width] duration-300 ${
                          contextMeasure.ratio >= 0.9
                            ? "bg-red-500"
                            : contextMeasure.ratio >= COMPACT_THRESHOLD
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(3, contextMeasure.ratio * 100))}%`,
                        }}
                      />
                    </div>
                    <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-muted-foreground">
                      {formatTokens(contextMeasure.tokens)} /{" "}
                      {formatTokens(contextMeasure.limit)}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-60">
                  {t("agent.contextUsageHint", {
                    percent: Math.round(contextMeasure.ratio * 100),
                    tokens: contextMeasure.tokens,
                    limit: contextMeasure.limit,
                    threshold: Math.round(COMPACT_THRESHOLD * 100),
                  })}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend(sendMode === "new");
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleComposerDrop}
          className="flex items-stretch gap-1.5"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={handleFileInputChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming || !imagesSupported}
            aria-label={t("agent.attachImage")}
            title={
              imagesSupported
                ? t("agent.attachImage")
                : t("agent.imageModelNoVision")
            }
            className="glass-control inline-flex w-10 shrink-0 items-center justify-center rounded-xl transition duration-150 hover:brightness-[1.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ImageIcon className="size-4" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {attachments.map((a) => (
                  <div key={a.id} className="relative">
                    <ImageLightbox
                      src={imageContentToDataUrl(a.content)}
                      alt={a.name}
                      className="size-14 rounded-lg border border-border/50 bg-background object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      aria-label={t("agent.removeAttachment")}
                      title={t("agent.removeAttachment")}
                      className="absolute -right-1 -top-1 rounded-full border border-border/50 bg-background p-0.5 text-muted-foreground transition hover:text-foreground"
                    >
                      <XIcon className="size-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key !== "Enter") {
                  return;
                }
                if (event.ctrlKey || event.metaKey) {
                  // Always "send and start a new conversation", regardless
                  // of the send-button mode.
                  event.preventDefault();
                  void handleSend(true);
                } else if (!event.shiftKey) {
                  event.preventDefault();
                  void handleSend(sendMode === "new");
                }
              }}
              onPaste={handleComposerPaste}
              placeholder={t("agent.chatPlaceholder")}
              rows={2}
              className="min-h-10 w-full flex-1 resize-none rounded-xl border border-border/50 bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring disabled:opacity-50"
            />
          </div>
          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              aria-label={t("agent.stop")}
              title={t("agent.stop")}
              className="glass-control inline-flex w-10 shrink-0 items-center justify-center rounded-xl transition duration-150 hover:brightness-[1.06] active:scale-[0.98]"
            >
              <SquareIcon className="size-4" />
            </button>
          ) : (
            <div className="flex shrink-0 items-stretch overflow-hidden rounded-xl">
              <button
                type="submit"
                disabled={sendDisabled}
                aria-label={
                  sendMode === "new" ? t("agent.sendNew") : t("agent.send")
                }
                title={
                  sendMode === "new" ? t("agent.sendNew") : t("agent.send")
                }
                className="inline-flex w-9 items-center justify-center bg-primary text-white transition duration-150 hover:brightness-[1.06] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <SendIcon className="size-4" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  type="button"
                  disabled={sendDisabled}
                  aria-label={t("agent.sendOptions")}
                  title={t("agent.sendOptions")}
                  className="flex items-center border-l border-white/25 bg-primary px-1 text-white outline-none transition duration-150 hover:brightness-[1.06] aria-expanded:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronDownIcon className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="text-xs">
                  <DropdownMenuRadioGroup
                    value={sendMode}
                    onValueChange={(value) =>
                      setSendMode(value as "current" | "new")
                    }
                  >
                    <DropdownMenuRadioItem value="current">
                      {t("agent.sendCurrent")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="new">
                      {t("agent.sendNew")}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </form>
      </footer>
    </div>
  );
}

/**
 * Memoized so the workbench's 1 Hz "rendered Xs ago" ticker (which re-renders
 * the whole panel) doesn't reconcile the composer and its file input every
 * second. Internal state/atom subscriptions still update it normally.
 */
export const AgentChat = memo(AgentChatBase);
