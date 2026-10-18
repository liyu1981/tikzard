/**
 * One-time wiring of the tikzard app state into ReAgent's stores.
 *
 * ReAgent keeps its keys, config and conversations in its own storage
 * namespace (`tikzard.*` localStorage + the `tikzard-agent` IndexedDB). The
 * pre-ReAgent app used the same `tikzard-agent` database (so conversations
 * carry over unchanged) but different `agent.*` localStorage keys, hence the
 * small credential/base-URL/model migration below.
 */
import {
  type AgentConfig,
  getAgentConfig,
  storageKey,
  updateAgentConfig,
} from "@liyu1981/reagent";
import { getBundledSkillConfigs } from "./skills";

const SEED_KEY = "tikzard.skills.seedVersion";
/** Bump to re-offer updated bundled skill bodies after a release. */
const SEED_VERSION = 1;

const MIGRATION_KEY = "tikzard.agent.migratedV1";
const LEGACY_CREDENTIAL_PREFIX = "agent.credential.";
/** The pre-ReAgent local provider id; ReAgent calls it `ollama`. */
const LEGACY_LOCAL_PROVIDER_ID = "local-openai";

interface LegacyModelRef {
  providerId: string;
  modelId: string;
}

function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

/** Copy pre-ReAgent provider keys / local URL / model preference once. */
function migrateLegacyState(prefix: string): void {
  if (localStorage.getItem(MIGRATION_KEY) === "1") {
    return;
  }

  // Cloud API keys: `agent.credential.<provider>` → `<prefix>.credential.*`.
  const legacyKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(LEGACY_CREDENTIAL_PREFIX)) {
      legacyKeys.push(key);
    }
  }
  for (const key of legacyKeys) {
    const providerId = key.slice(LEGACY_CREDENTIAL_PREFIX.length);
    if (providerId === LEGACY_LOCAL_PROVIDER_ID) {
      continue;
    }
    const value = localStorage.getItem(key);
    const nextKey = storageKey(prefix, `credential.${providerId}`);
    if (value !== null && localStorage.getItem(nextKey) === null) {
      localStorage.setItem(nextKey, value);
    }
  }

  const config = getAgentConfig(prefix);
  const patch: Partial<AgentConfig> = {};

  const legacyBaseUrl = localStorage.getItem("agent.local.baseUrl");
  if (legacyBaseUrl !== null) {
    patch.providers = {
      ...config.providers,
      ollama: { ...config.providers.ollama, baseUrl: legacyBaseUrl },
    };
  }

  const legacyModel = readJson<LegacyModelRef>("agent.lastModel");
  if (
    config.model === null &&
    legacyModel !== undefined &&
    legacyModel.providerId !== LEGACY_LOCAL_PROVIDER_ID
  ) {
    patch.model = {
      providerId: legacyModel.providerId,
      modelId: legacyModel.modelId,
    };
  }

  if (Object.keys(patch).length > 0) {
    updateAgentConfig(patch, prefix);
  }
  localStorage.setItem(MIGRATION_KEY, "1");
}

/** Seed the bundled drawing guides into ReAgent's skill registry once. */
function seedBundledSkills(prefix: string): void {
  if (localStorage.getItem(SEED_KEY) === String(SEED_VERSION)) {
    return;
  }
  const config = getAgentConfig(prefix);
  const existing = new Set(config.skills.map((skill) => skill.id));
  const additions = getBundledSkillConfigs().filter(
    (skill) => !existing.has(skill.id),
  );
  if (additions.length > 0) {
    updateAgentConfig({ skills: [...config.skills, ...additions] }, prefix);
  }
  localStorage.setItem(SEED_KEY, String(SEED_VERSION));
}

export function ensureAgentState(prefix: string): void {
  try {
    migrateLegacyState(prefix);
    seedBundledSkills(prefix);
  } catch {
    // Storage unavailable — the assistant runs with its defaults.
  }
}
