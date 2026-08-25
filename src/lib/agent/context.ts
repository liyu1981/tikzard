"use client";

/**
 * Context-window management for the agent: estimate how much of the model's
 * context the conversation occupies, and when it crosses a safety threshold,
 * fold the oldest turns into an LLM-written summary so long sessions keep
 * working on models with small windows (local llama.cpp/Ollama servers often
 * enforce far fewer tokens than their catalogs advertise).
 */

import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { IMAGE_TOKEN_ESTIMATE } from "./images";
import { getModels } from "./models";

type AnyModel = Model<Api>;

/** Compact once the conversation crosses this fraction of the window. */
export const COMPACT_THRESHOLD = 0.75;

/** Rough chars-per-token for mixed prose/code when no usage data exists. */
const CHARS_PER_TOKEN = 4;

/** Per-message envelope overhead (role framing and separators). */
const TOKENS_PER_MESSAGE = 8;

/** Newest messages kept verbatim across a compaction pass. */
const KEEP_RECENT_MESSAGES = 6;

/** Summarizer input is capped so the summary call itself fits tiny windows. */
const MAX_SUMMARY_INPUT_CHARS = 24000;

const LIMIT_KEY_PREFIX = "agent.ctxLimit.";

function ls(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function limitKey(providerId: string, modelId: string): string {
  return `${LIMIT_KEY_PREFIX}${providerId}::${modelId}`;
}

/**
 * Remember a hard context limit discovered from a provider rejection (e.g.
 * Ollama answers `…exceeds the available context size (16384 tokens)`).
 * Catalog metadata tends to over-report, so the observed limit wins.
 */
export function storeObservedContextLimit(
  providerId: string,
  modelId: string,
  limit: number,
): void {
  const key = limitKey(providerId, modelId);
  const existing = Number(ls()?.getItem(key));
  if (Number.isFinite(existing) && existing > 0) {
    ls()?.setItem(key, String(Math.min(existing, limit)));
  } else {
    ls()?.setItem(key, String(limit));
  }
}

/**
 * Effective usable window: the smallest of catalog metadata and any limit
 * learned from a previous overflow rejection for this exact model.
 */
export function effectiveContextWindow(model: AnyModel): number {
  const observed = Number(ls()?.getItem(limitKey(model.provider, model.id)));
  const catalog = model.contextWindow ?? 128000;
  return Number.isFinite(observed) && observed > 0
    ? Math.min(catalog, observed)
    : catalog;
}

export interface OverflowInfo {
  overflow: boolean;
  /** Provider-reported hard limit, when its error message carries one. */
  limit?: number;
}

/**
 * Detect context-overflow rejections across provider error styles
 * (Ollama/openai-completions, OpenAI, generic wording).
 */
export function parseContextOverflow(raw: string): OverflowInfo | null {
  if (!raw) {
    return null;
  }
  const ollama = /exceeds the available context size \((\d+)\)/.exec(raw);
  if (ollama?.[1]) {
    return { overflow: true, limit: Number(ollama[1]) };
  }
  const openai =
    /maximum context length is \d+ tokens(?:.+?context_length_exceeded)?/i.exec(
      raw,
    ) ?? /context_length_exceeded/.exec(raw);
  if (openai) {
    const limit = /context window is (\d+)/i.exec(raw)?.[1];
    return { overflow: true, limit: limit ? Number(limit) : undefined };
  }
  if (/exceed[s]? (the )?(available )?context/i.test(raw)) {
    return { overflow: true };
  }
  return null;
}

function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN) + TOKENS_PER_MESSAGE;
}

function messageText(message: AgentMessage): string {
  if (
    message.role !== "user" &&
    message.role !== "assistant" &&
    message.role !== "toolResult"
  ) {
    // UI-only custom message types carry no LLM context weight.
    return "";
  }
  const content: unknown = message.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  let out = "";
  for (const block of content) {
    const b = block as { type?: string; text?: string; name?: string };
    if (b.type === "text") {
      out += `${b.text ?? ""}\n`;
    } else if (b.type === "thinking") {
      // Count thinking conservatively even though it is not replayed.
      out += `${b.text ?? ""}\n`;
    } else if (b.type === "image") {
      out += "[image]\n";
    } else if (b.type === "toolCall") {
      out += `[tool:${b.name ?? "?"}] ${JSON.stringify(
        (b as { arguments?: unknown }).arguments ?? null,
      )}\n`;
    }
  }
  return out;
}

/** Text tokens plus a fixed vision cost per attached image block. */
function estimateMessageTokens(message: AgentMessage): number {
  let tokens = estimateTextTokens(messageText(message));
  if (
    (message.role === "user" ||
      message.role === "assistant" ||
      message.role === "toolResult") &&
    Array.isArray(message.content)
  ) {
    for (const block of message.content) {
      if ((block as { type?: string }).type === "image") {
        tokens += IMAGE_TOKEN_ESTIMATE;
      }
    }
  }
  return tokens;
}

export interface ContextMeasure {
  tokens: number;
  limit: number;
  ratio: number;
}

/**
 * Best-effort token estimate for the next request. When the transcript
 * already contains an assistant reply, its reported `usage.input` is the
 * provider's own count for a previous identical prefix — far more accurate
 * than the char heuristic — so the estimate is max(heuristic, last observed
 * input + estimated growth since).
 */
export function measureContext(
  model: AnyModel,
  systemPrompt: string,
  messages: AgentMessage[],
): ContextMeasure {
  let running = estimateTextTokens(systemPrompt ?? "");
  let heuristic = running;
  let anchor = { inputTokens: 0, priorSum: 0 };
  for (const message of messages) {
    running += estimateMessageTokens(message);
    heuristic = running;
    if (message.role === "assistant" && message.usage?.input !== undefined) {
      const input = message.usage.input;
      if (input > anchor.inputTokens) {
        anchor = { inputTokens: input, priorSum: heuristic };
      }
    }
  }
  let tokens = heuristic;
  if (anchor.inputTokens > 0) {
    // Provider-counted prompt size for an identical earlier prefix, plus
    // everything appended since that reply.
    tokens = Math.max(tokens, anchor.inputTokens + (running - anchor.priorSum));
  }
  const limit = effectiveContextWindow(model);
  return { tokens, limit, ratio: limit > 0 ? tokens / limit : 0 };
}

/**
 * Pick the cut index that keeps the newest KEEP_RECENT_MESSAGES messages
 * verbatim. The retained segment must start on a user message so the LLM
 * never sees a tool result (or a tool call) whose partner was summarized
 * away. Returns -1 when nothing can be safely cut.
 */
function findCutIndex(messages: AgentMessage[]): number {
  if (messages.length <= KEEP_RECENT_MESSAGES) {
    return -1;
  }
  let cut = messages.length - KEEP_RECENT_MESSAGES;
  while (cut < messages.length && messages[cut].role !== "user") {
    cut += 1;
  }
  if (cut >= messages.length || cut <= 0) {
    return -1;
  }
  return cut;
}

function renderForSummary(messages: AgentMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const role =
      message.role === "user"
        ? "USER"
        : message.role === "assistant"
          ? "ASSISTANT"
          : message.role === "toolResult"
            ? "TOOL"
            : message.role.toUpperCase();
    lines.push(`${role}: ${messageText(message).trim()}`);
  }
  const text = lines.join("\n\n");
  return text.length > MAX_SUMMARY_INPUT_CHARS
    ? `${text.slice(0, MAX_SUMMARY_INPUT_CHARS)}\n…[earlier turns truncated]`
    : text;
}

const SUMMARY_SYSTEM_PROMPT =
  "You are a meticulous conversation archivist. Condense the provided AI-assistant transcript into dense notes that preserve everything needed to continue the work seamlessly: the user's goals and constraints, decisions made, facts and values, tool calls and their outcomes, open questions, and the current task state. Write compact bullet points. Do not editorialize and do not answer the conversation — only summarize it.";

/**
 * Fold the oldest turns into a summary and return the replacement
 * transcript: one user message carrying the notes followed by the retained
 * recent turns. Returns null when the transcript is too short to compact.
 */
export async function compactConversation(
  model: AnyModel,
  messages: AgentMessage[],
  signal?: AbortSignal,
): Promise<AgentMessage[] | null> {
  const cut = findCutIndex(messages);
  if (cut < 0) {
    return null;
  }
  const toSummarize = messages.slice(0, cut);
  const retained = messages.slice(cut);

  const models = getModels();
  const response = await models.completeSimple(
    model,
    {
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Summarize the following transcript for continuation.\n\n<transcript>\n${renderForSummary(toSummarize)}\n</transcript>`,
          timestamp: Date.now(),
        },
      ],
    },
    { signal, maxTokens: 1024 },
  );

  const notes =
    response.stopReason === "error" || response.stopReason === "aborted"
      ? ""
      : response.content
          .filter((b) => b.type === "text")
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("\n")
          .trim();

  const summaryBody =
    notes ||
    "(Summary unavailable — earlier turns were removed to fit the context window.)";

  const summaryMessage: AgentMessage = {
    role: "user",
    timestamp: Date.now(),
    content: `<context-summary note="Older turns were compacted into these notes; the full transcript is archived in storage.">\n${summaryBody}\n</context-summary>\n\nContinue the work above using these notes together with the recent messages that follow.`,
  };

  return [summaryMessage, ...retained];
}

/**
 * Ensure the agent's transcript fits within the model's effective context
 * window (with headroom below COMPACT_THRESHOLD), compacting repeatedly if
 * needed. Mutates `agent.state.messages`; returns true when anything was
 * compacted.
 */
export async function ensureContextCapacity(
  agent: Agent,
  notify?: (message: string) => void,
): Promise<boolean> {
  let compacted = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { tokens, limit, ratio } = measureContext(
      agent.state.model,
      agent.state.systemPrompt ?? "",
      agent.state.messages,
    );
    if (ratio <= COMPACT_THRESHOLD) {
      break;
    }
    notify?.(
      `Context ${tokens}/${limit} tokens (${Math.round(ratio * 100)}%) — compacting…`,
    );
    const next = await compactConversation(
      agent.state.model,
      agent.state.messages,
    );
    if (next === null) {
      break;
    }
    // Assigning copies the array into state (per Agent docs) and the next
    // prompt picks it up; syncTranscript()/persistence happens in the caller.
    agent.state.messages = next;
    compacted = true;
  }
  return compacted;
}
