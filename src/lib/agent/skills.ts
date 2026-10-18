/**
 * Bundled agent skills following the Agent Skills standard
 * (agentskills.io): each skill is a SKILL.md file with YAML frontmatter
 * (name, description) and an instruction body, authored under
 * src/lib/agent/skills/<name>/SKILL.md and imported as raw text at build
 * time (offline-first - no runtime fetch, no filesystem).
 *
 * The parsed guides are seeded into ReAgent's skill registry (see
 * bootstrap.ts): only names and descriptions go into the system prompt, and
 * the full instructions are loaded on demand through ReAgent's built-in
 * `use_skill` tool.
 */
import tikzCoreStyle from "./skills/tikz-core-style/SKILL.md";
import tikzDomainPackages from "./skills/tikz-domain-packages/SKILL.md";
import tikzFunctionPlots from "./skills/tikz-function-plots/SKILL.md";
import tikzNodesDiagrams from "./skills/tikz-nodes-diagrams/SKILL.md";

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

/** Shape ReAgent stores skills in (see its `AgentSkillConfig`). */
export interface BundledSkillConfig {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
}

/** Parse a leading `---` frontmatter block into scalar key/value pairs. */
function parseFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: {}, body: normalized.trim() };
  }
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: {}, body: normalized.trim() };
  }
  const frontmatter: Record<string, string> = {};
  for (const line of normalized.slice(4, end).split("\n")) {
    const sep = line.indexOf(":");
    if (sep <= 0) {
      continue;
    }
    const key = line.slice(0, sep).trim();
    const value = line
      .slice(sep + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key !== "") {
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body: normalized.slice(end + 4).trim() };
}

/** Turn a raw SKILL.md string into a skill config, or null when invalid. */
function toSkillConfig(
  raw: string,
  sourceName: string,
): BundledSkillConfig | null {
  const { frontmatter, body } = parseFrontmatter(raw);
  const name = frontmatter.name ?? sourceName;
  const description = frontmatter.description ?? "";
  const problems: string[] = [];
  if (description === "") {
    problems.push("missing description");
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    problems.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} chars`);
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    problems.push("invalid name characters");
  }
  if (
    name.length > MAX_NAME_LENGTH ||
    name.startsWith("-") ||
    name.endsWith("-") ||
    name.includes("--")
  ) {
    problems.push(`invalid name "${name}"`);
  }
  if (problems.length > 0) {
    console.warn(
      `[skills] skipping skill "${sourceName}":`,
      problems.join("; "),
    );
    return null;
  }
  return { id: name, name, description, content: body, enabled: true };
}

let cached: BundledSkillConfig[] | null = null;

/** All valid bundled skills, parsed once per page load. */
export function getBundledSkillConfigs(): BundledSkillConfig[] {
  if (cached === null) {
    cached = [
      ["tikz-core-style", tikzCoreStyle],
      ["tikz-domain-packages", tikzDomainPackages],
      ["tikz-function-plots", tikzFunctionPlots],
      ["tikz-nodes-diagrams", tikzNodesDiagrams],
    ].flatMap(([sourceName, raw]) => {
      const skill = toSkillConfig(raw, sourceName);
      return skill === null ? [] : [skill];
    });
  }
  return cached;
}
