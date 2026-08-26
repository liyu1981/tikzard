import type { Api, Model } from "@earendil-works/pi-ai";

/**
 * Curated allowlists per remote provider id. The full upstream catalogs are
 * noisy (retired models, dated snapshots, batch/free twins, coding specials),
 * so the model picker only offers the entries below; anything else remains
 * reachable by typing an exact model id (see `resolveModel` in models.ts).
 *
 * Pattern semantics:
 * - matched case-insensitively against the full model id (`vendor/slug`);
 * - `*` matches any run of characters, `?` a single character;
 * - patterns starting with `!` are exclusions and always win over inclusions;
 * - a provider key that is absent leaves its catalog unfiltered (local LLMs);
 * - a present-but-empty list allows nothing (kill switch).
 */
const CURATED_MODEL_PATTERNS: Readonly<Record<string, readonly string[]>> = {
  // Current GPT-5 mainline: drop gpt-4-era models, o1/o3/o4, realtime,
  // dated snapshots, chat-latest aliases, codex/spark specials and nano.
  openai: ["gpt-5*", "!*-chat-latest", "!*codex*", "!*-nano"],
  // Alias ids only: drop the dated `-20251001`-style snapshot pins.
  anthropic: ["claude-*", "!*-20??????"],
  deepseek: ["deepseek-*"],
  // Fast-inference staples; drop the tiny llama/gpt-oss sizes and the
  // safeguard-tuned variant.
  groq: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/*"],
  // Frontier vendor families on OpenRouter, minus the noise variants.
  openrouter: [
    "anthropic/claude-*",
    "openai/gpt-5*",
    "google/gemini-3*",
    "deepseek/deepseek-v4*",
    "moonshotai/kimi-*",
    "x-ai/grok-*",
    "z-ai/glm-*",
    "qwen/qwen3.8-*",
    "xiaomi/mimo-*",
    "tencent/hy*",
    "!*:batch",
    "!*:free",
    "!auto",
    "!*-build*",
    "!*-code*",
    "!*codex*",
    "!*-chat-latest",
    "!*-nano",
    "!*image*",
  ],
};

/** Glob → RegExp: case-insensitive, anchored, `*`/`?` wildcards. */
function compilePattern(pattern: string): RegExp {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${source}$`, "i");
}

/**
 * Filter a provider catalog down to its curated allowlist. Providers without
 * an entry are returned unchanged; with one, a model survives when some
 * inclusion pattern matches and no exclusion does.
 */
export function curateModels<ApiT extends Api>(
  providerId: string,
  models: readonly Model<ApiT>[],
): Model<ApiT>[] {
  const patterns = CURATED_MODEL_PATTERNS[providerId];
  if (patterns === undefined) {
    return [...models];
  }
  const includes = patterns
    .filter((p) => !p.startsWith("!"))
    .map(compilePattern);
  const excludes = patterns
    .filter((p) => p.startsWith("!"))
    .map((p) => compilePattern(p.slice(1)));
  return models.filter(
    (model) =>
      includes.some((re) => re.test(model.id)) &&
      !excludes.some((re) => re.test(model.id)),
  );
}
