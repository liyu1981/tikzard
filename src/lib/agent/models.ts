import {
  type Api,
  type CreateProviderOptions,
  type Credential,
  type CredentialInfo,
  type CredentialStore,
  createModels,
  createProvider,
  type Model,
  type MutableModels,
  type Provider,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { groqProvider } from "@earendil-works/pi-ai/providers/groq";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { OPENROUTER_MODELS } from "@earendil-works/pi-ai/providers/openrouter.models";
import { curateModels } from "./model-catalog";

export const LOCAL_PROVIDER_ID = "local-openai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const DEFAULT_LOCAL_BASE_URL = "http://localhost:11434";

const LOCAL_BASE_URL_KEY = "agent.local.baseUrl";

function ls(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function readJson<T>(key: string): T | undefined {
  try {
    const raw = ls()?.getItem(key);
    return raw === null || raw === undefined
      ? undefined
      : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): void {
  ls()?.setItem(key, JSON.stringify(value));
}

/**
 * localStorage-backed CredentialStore implementing pi-ai's read/modify/delete
 * contract. Keys stay on the device; pi-ai resolves them per request and sends
 * them straight to the provider the user chose.
 */
class LocalCredentialStore implements CredentialStore {
  private readonly chains = new Map<string, Promise<unknown>>();

  private credentialKey(providerId: string): string {
    return `agent.credential.${providerId}`;
  }

  async read(providerId: string): Promise<Credential | undefined> {
    return readJson<Credential>(this.credentialKey(providerId));
  }

  async list(): Promise<readonly CredentialInfo[]> {
    const storage = ls();
    const infos: CredentialInfo[] = [];
    const length = storage?.length ?? 0;
    for (let i = 0; i < length; i += 1) {
      const key = storage?.key(i);
      if (key === undefined || key === null) {
        continue;
      }
      const match = key.match(/^agent\.credential\.(.+)$/);
      if (match?.[1]) {
        const credential = readJson<Credential>(key);
        if (credential !== undefined) {
          infos.push({ providerId: match[1], type: credential.type });
        }
      }
    }
    return infos;
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    const chain = this.chains.get(providerId) ?? Promise.resolve();
    const run = chain.then(async () => {
      const current = readJson<Credential>(this.credentialKey(providerId));
      const next = await fn(current);
      if (next === undefined) {
        ls()?.removeItem(this.credentialKey(providerId));
      } else {
        writeJson(this.credentialKey(providerId), next);
      }
      return next;
    });
    this.chains.set(
      providerId,
      run.catch(() => undefined),
    );
    return run;
  }

  async delete(providerId: string): Promise<void> {
    ls()?.removeItem(this.credentialKey(providerId));
  }
}

const credentialStore = new LocalCredentialStore();

export function getLocalBaseUrl(): string {
  return ls()?.getItem(LOCAL_BASE_URL_KEY) ?? DEFAULT_LOCAL_BASE_URL;
}

export function setLocalBaseUrl(url: string): void {
  const normalized = url.trim().replace(/\/+$/, "") || DEFAULT_LOCAL_BASE_URL;
  ls()?.setItem(LOCAL_BASE_URL_KEY, normalized);
  unverify(LOCAL_PROVIDER_ID);
  rebuildModels();
}

const VERIFIED_KEY = "agent.verified.providers";

function readVerified(): string[] {
  try {
    const raw = ls()?.getItem(VERIFIED_KEY);
    if (raw === null || raw === undefined) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeVerified(ids: string[]): void {
  ls()?.setItem(VERIFIED_KEY, JSON.stringify(ids));
}

/** Providers whose connection was verified by a successful test. */
export function isVerified(providerId: string): boolean {
  return readVerified().includes(providerId);
}

function markVerified(providerId: string): void {
  const ids = readVerified();
  if (!ids.includes(providerId)) {
    writeVerified([...ids, providerId]);
  }
}

function unverify(providerId: string): void {
  writeVerified(readVerified().filter((id) => id !== providerId));
}

export function hasCredential(providerId: string): boolean {
  return (ls()?.getItem(`agent.credential.${providerId}`) ?? null) !== null;
}

export async function saveApiKey(
  providerId: string,
  key: string,
): Promise<void> {
  await credentialStore.modify(providerId, async () => ({
    type: "api_key" as const,
    key: key.trim(),
  }));
  unverify(providerId);
}

export async function clearApiKey(providerId: string): Promise<void> {
  await credentialStore.delete(providerId);
  unverify(providerId);
}

function localModel(
  id: string,
  baseUrl: string,
  input: ("text" | "image")[] = ["text"],
): Model<"openai-completions"> {
  return {
    id,
    name: id,
    api: "openai-completions",
    provider: LOCAL_PROVIDER_ID,
    baseUrl,
    reasoning: false,
    input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32000,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  };
}

/** Smallest valid PNG (1×1, transparent) sent with the vision probe. */
const VISION_PROBE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Cold model loads can be slow; give the probe generous room. */
const IMAGE_PROBE_TIMEOUT_MS = 30_000;

interface ChatCompletionsDto {
  choices?: unknown[];
  error?: { message?: string };
}

/**
 * Generic OpenAI-compatible image-input probe: POST a tiny multimodal
 * chat/completions request and see whether the server accepts it. This is the
 * only capability check that works across every spec-following local server
 * (Ollama, llama.cpp, LM Studio, vLLM, …) because the OpenAI API defines no
 * capability-metadata endpoint. Returns true when a completion came back,
 * false when the server rejected the image payload, and undefined when the
 * result is inconclusive (network/CORS/timeout) — callers then assume
 * text-only. Logs each verdict to the console.
 */
async function probeImageInput(
  v1Url: string,
  id: string,
  signal: AbortSignal,
): Promise<boolean | undefined> {
  const timeout = AbortSignal.timeout(IMAGE_PROBE_TIMEOUT_MS);
  const merged = signal.aborted ? signal : AbortSignal.any([signal, timeout]);
  const started = performance.now();
  try {
    const response = await fetch(`${v1Url}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: id,
        max_tokens: 4,
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Reply with exactly: ok" },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${VISION_PROBE_PNG}`,
                },
              },
            ],
          },
        ],
      }),
      signal: merged,
    });
    const ms = Math.round(performance.now() - started);
    if (response.ok) {
      const data = (await response.json().catch(() => undefined)) as
        | ChatCompletionsDto
        | undefined;
      if (data !== undefined && Array.isArray(data.choices)) {
        console.info(`[agent] "${id}" accepts image input (${ms} ms)`);
        return true;
      }
      console.info(
        `[agent] "${id}" returned no completion for the image probe (${ms} ms)`,
      );
      return false;
    }
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    console.info(
      `[agent] "${id}" rejects image input — HTTP ${response.status}${detail ? `: ${detail}` : ""} (${ms} ms)`,
    );
    return false;
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    console.warn(
      `[agent] "${id}" image probe inconclusive (${ms} ms), assuming text-only:`,
      err,
    );
    return undefined;
  }
}

async function fetchLocalModels(
  apiBase: string,
  v1Url: string,
  signal: AbortSignal,
): Promise<Model<"openai-completions">[]> {
  let ids: string[] = [];
  try {
    const response = await fetch(`${v1Url}/models`, { signal });
    if (response.ok) {
      const data = (await response.json()) as { data?: Array<{ id: string }> };
      ids = data?.data?.map((m) => m.id) ?? [];
    }
  } catch {
    // fall through to the native Ollama endpoint
  }
  if (ids.length === 0) {
    try {
      const response = await fetch(`${apiBase}/api/tags`, { signal });
      if (response.ok) {
        const data = (await response.json()) as {
          models?: Array<{ name: string }>;
        };
        ids = data?.models?.map((m) => m.name) ?? [];
      }
    } catch {
      // ignore — the list stays empty until the endpoint answers
    }
  }
  // Embedding/CLIP/reranker checkpoints cannot chat; vision-named ones can,
  // so only those three families are excluded.
  const candidates = ids.filter((id) => !/embed|clip|rerank/i.test(id));
  console.info(
    `[agent] local LLM catalog: ${candidates.length} chat-capable model(s) at ${v1Url}`,
  );
  const models: Model<"openai-completions">[] = [];
  // Sequential on purpose: each probe is a real completion that may load the
  // model into memory, and parallel probes could page every listing into
  // GPU/VRAM at once. Every candidate is probed — model ids say nothing
  // reliable about vision support, only the server's answer does.
  for (const id of candidates) {
    const input: ("text" | "image")[] =
      (await probeImageInput(v1Url, id, signal)) === true
        ? ["text", "image"]
        : ["text"];
    models.push(localModel(id, v1Url, input));
  }
  return models;
}

function buildLocalProvider(baseUrl: string) {
  const v1Url = `${baseUrl}/v1`;
  return createProvider({
    id: LOCAL_PROVIDER_ID,
    name: "Local LLM",
    baseUrl: v1Url,
    auth: {
      apiKey: {
        name: "OpenAI-compatible local LLM",
        resolve: async () => ({ auth: { apiKey: "local" } }),
      },
    },
    models: [],
    fetchModels: async ({ signal }) => fetchLocalModels(baseUrl, v1Url, signal),
    api: openAICompletionsApi(),
  });
}

interface OpenRouterModelDto {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[] };
  top_provider?: {
    context_length?: number | null;
    max_completion_tokens?: number | null;
  };
  pricing?: { prompt?: string; completion?: string; cache_read?: string };
  supported_parameters?: string[];
}

/**
 * The pi-ai built-in OpenRouter provider ships a static catalog that goes
 * stale (its first entry, ai21/jamba-large-1.7, no longer has endpoints, so
 * "test connection" 404s). Rebuild it with an empty baseline and a
 * fetchModels that pulls the live /models list; the static catalog is kept
 * only as an offline fallback. Auth config is reused from the original.
 */
/**
 * Rebuild a static-catalog provider with only its curated models. The
 * upstream factories ship every model the vendor ever published; the wrapper
 * keeps id, naming, baseUrl and auth but swaps in the filtered list. Static
 * providers have no refreshModels, so this list is final — which is exactly
 * what we want for the curated cloud catalogs.
 */
function curateProvider<TApi extends Api>(
  base: Provider<TApi>,
  api: CreateProviderOptions<TApi>["api"],
): Provider<TApi> {
  return createProvider({
    id: base.id,
    name: base.name,
    baseUrl: base.baseUrl,
    headers: base.headers,
    auth: base.auth,
    models: curateModels(base.id, base.getModels()),
    api,
  });
}

function buildOpenRouterProvider() {
  const base = openrouterProvider();
  return createProvider({
    id: base.id,
    name: base.name,
    baseUrl: base.baseUrl,
    auth: base.auth,
    models: [],
    api: openAICompletionsApi(),
    fetchModels: async ({ signal }) => {
      const fallback = (): Model<"openai-completions">[] =>
        Object.values(OPENROUTER_MODELS).map((model) => ({
          ...model,
          baseUrl: OPENROUTER_BASE_URL,
        }));
      try {
        const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
          signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as {
          data?: OpenRouterModelDto[];
        };
        const mapped = (data.data ?? [])
          .filter(
            (dto) =>
              dto.architecture?.input_modalities === undefined ||
              dto.architecture.input_modalities.includes("text"),
          )
          .map<Model<"openai-completions">>((dto) => ({
            id: dto.id,
            name: dto.name ?? dto.id,
            api: "openai-completions",
            provider: "openrouter",
            baseUrl: OPENROUTER_BASE_URL,
            reasoning: dto.supported_parameters?.includes("reasoning") ?? false,
            input: dto.architecture?.input_modalities?.includes("image")
              ? ["text", "image"]
              : ["text"],
            cost: {
              input: Number.parseFloat(dto.pricing?.prompt ?? "0") || 0,
              output: Number.parseFloat(dto.pricing?.completion ?? "0") || 0,
              cacheRead: Number.parseFloat(dto.pricing?.cache_read ?? "0") || 0,
              cacheWrite: 0,
            },
            contextWindow:
              dto.top_provider?.context_length ?? dto.context_length ?? 128000,
            maxTokens: dto.top_provider?.max_completion_tokens ?? 8192,
          }))
          .sort((a, b) => a.id.localeCompare(b.id));
        // Both the live list and the static fallback go through the curated
        // allowlist; an empty result after curation still counts as success.
        const curated = curateModels(
          "openrouter",
          mapped.length > 0 ? mapped : fallback(),
        );
        return curated;
      } catch {
        return curateModels("openrouter", fallback());
      }
    },
  });
}

function buildModels(): MutableModels {
  const models = createModels({ credentials: credentialStore });
  models.setProvider(buildLocalProvider(getLocalBaseUrl()));
  models.setProvider(curateProvider(openaiProvider(), openAIResponsesApi()));
  models.setProvider(
    curateProvider(anthropicProvider(), anthropicMessagesApi()),
  );
  models.setProvider(buildOpenRouterProvider());
  models.setProvider(
    curateProvider(deepseekProvider(), openAICompletionsApi()),
  );
  models.setProvider(curateProvider(groqProvider(), openAICompletionsApi()));
  return models;
}

let models: MutableModels | null = null;

export function getModels(): MutableModels {
  if (models === null) {
    models = buildModels();
  }
  return models;
}

export function rebuildModels(): MutableModels {
  models = buildModels();
  return models;
}

export function getModel(providerId: string, modelId: string) {
  return getModels().getModel(providerId, modelId);
}

/**
 * Like getModel, but also resolves a custom model id that isn't in any
 * catalog — it clones a same-provider sibling for the correct api/baseUrl, or
 * synthesizes a minimal openai-completions model so user-typed slugs (e.g. an
 * OpenRouter model not returned by /models) still drive the agent instance.
 */
export function resolveModel(providerId: string, modelId: string) {
  const existing = getModel(providerId, modelId);
  if (existing !== undefined) {
    return existing;
  }
  const sibling = getModels().getModels(providerId)[0];
  if (sibling !== undefined) {
    return { ...sibling, id: modelId, name: modelId };
  }
  const baseUrl = getModels().getProvider(providerId)?.baseUrl;
  if (baseUrl === undefined) {
    return undefined;
  }
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: providerId,
    baseUrl,
    reasoning: false,
    input: ["text"] as "text"[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  } as Model<"openai-completions">;
}

export function listModels(): Array<{
  provider: string;
  providerName: string;
  model: Model<Api>;
}> {
  const all = getModels();
  const out: Array<{
    provider: string;
    providerName: string;
    model: Model<Api>;
  }> = [];
  for (const provider of all.getProviders()) {
    for (const model of all.getModels(provider.id)) {
      out.push({ provider: provider.id, providerName: provider.name, model });
    }
  }
  return out;
}

/**
 * Models from providers whose connection was verified with a successful test.
 * This is the only list the agent UI should offer, so unconfigured providers
 * never show up in the model selector.
 */
export function listAvailableModels(): Array<{
  provider: string;
  providerName: string;
  model: Model<Api>;
}> {
  const all = getModels();
  const out: Array<{
    provider: string;
    providerName: string;
    model: Model<Api>;
  }> = [];
  for (const provider of all.getProviders()) {
    if (!isVerified(provider.id)) {
      continue;
    }
    for (const model of all.getModels(provider.id)) {
      out.push({ provider: provider.id, providerName: provider.name, model });
    }
  }
  return out;
}

export function refreshModels(providerIds?: readonly string[]): Promise<void> {
  return getModels()
    .refresh(providerIds === undefined ? undefined : { providers: providerIds })
    .then(() => undefined);
}

/**
 * Minimal connection test for a provider. Cloud providers resolve auth and
 * issue a tiny completion on their first model. The local OpenAI-compatible
 * provider probes `GET /v1/models` instead, so connectivity and keyless auth
 * are verified without depending on a specific model being loaded. Rejects
 * with a human-readable message on failure.
 */
export async function testConnection(providerId: string): Promise<string> {
  const models = getModels();
  const auth = await models.getAuth(providerId);
  if (auth === undefined) {
    throw new Error("not_configured");
  }
  if (providerId === LOCAL_PROVIDER_ID) {
    const v1Url = models.getProvider(providerId)?.baseUrl;
    if (v1Url === undefined) {
      throw new Error("no_model");
    }
    const base = v1Url.replace(/\/v1\/?$/, "");
    console.info(`[agent] testing local LLM connection at ${base}/v1 …`);
    const response = await fetch(`${base}/v1/models`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.warn(
        `[agent] local LLM connection failed — HTTP ${response.status}`,
      );
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    const count = data?.data?.length ?? 0;
    console.info(`[agent] local LLM reachable, ${count} model(s) listed`);
    markVerified(providerId);
    // Re-pull the catalog (probing each candidate model's image input via a
    // real multimodal completion) so the model picker reflects reality right
    // after the test.
    await refreshModels([providerId]).catch((err) => {
      console.warn("[agent] local catalog refresh after test failed:", err);
    });
    return count > 0 ? `${count} model${count === 1 ? "" : "s"}` : "reachable";
  }
  if (providerId === "openrouter") {
    // Validate the key against /key instead of a completion: the static
    // catalog can reference retired models, but the key check is what
    // actually proves the connection.
    const credential = await credentialStore.read("openrouter");
    const key = credential?.type === "api_key" ? credential.key : undefined;
    if (key === undefined || key.trim() === "") {
      throw new Error("not_configured");
    }
    const response = await fetch(`${OPENROUTER_BASE_URL}/key`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json().catch(() => undefined)) as {
      data?: { label?: string };
    };
    markVerified(providerId);
    void refreshModels().catch(() => undefined);
    const label = data.data?.label;
    return label !== undefined ? `key ${label}` : "key valid";
  }
  const model = models.getModels(providerId)[0];
  if (model === undefined) {
    throw new Error("no_model");
  }
  console.info(`[agent] testing ${providerId} via model ${model.id} …`);
  const response = await models.completeSimple(model, {
    messages: [
      {
        role: "user",
        content: "Reply with exactly: ok",
        timestamp: Date.now(),
      },
    ],
  });
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(
      response.errorMessage ?? `request_failed_${response.stopReason}`,
    );
  }
  markVerified(providerId);
  return model.id;
}
