/**
 * Bundled agent skills following the Agent Skills standard
 * (agentskills.io): each skill is a SKILL.md file with YAML frontmatter
 * (name, description) and an instruction body, authored under
 * src/lib/agent/skills/<name>/SKILL.md and imported as raw text at build
 * time (offline-first - no runtime fetch, no filesystem).
 *
 * Mirrors what pi-coding-agent does with @earendil-works/pi-agent-core's
 * loadSkills/formatSkillsForSystemPrompt/formatSkillInvocation trio, adapted
 * to this app's browser runtime: progressive disclosure - only names and
 * descriptions go into the system prompt; full instructions are loaded
 * on-demand through the host's load_skill tool.
 */
import type { Skill } from "@earendil-works/pi-agent-core";
import jsxgraphConstraints from "./skills/jsxgraph-constraints/SKILL.md";
import jsxgraphGeometry from "./skills/jsxgraph-geometry/SKILL.md";
import jsxgraphPlots from "./skills/jsxgraph-plots/SKILL.md";

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

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

/** Turn a raw SKILL.md string into a Skill, or null when it is invalid. */
function toSkill(raw: string, sourceName: string): Skill | null {
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
  return {
    name,
    description,
    content: body,
    filePath: `bundled://${name}/SKILL.md`,
    disableModelInvocation: false,
  };
}

let cached: Skill[] | null = null;

/** All valid bundled skills, parsed once per page load. */
export function getBundledSkills(): Skill[] {
  if (cached === null) {
    cached = [
      ["jsxgraph-constraints", jsxgraphConstraints],
      ["jsxgraph-plots", jsxgraphPlots],
      ["jsxgraph-geometry", jsxgraphGeometry],
    ].flatMap(([sourceName, raw]) => {
      const skill = toSkill(raw, sourceName);
      return skill === null ? [] : [skill];
    });
  }
  return cached;
}

export function getSkillByName(name: string): Skill | undefined {
  return getBundledSkills().find((skill) => skill.name === name);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * System-prompt block listing available skills (progressive disclosure).
 * Unlike pi's stock formatter, instructions point at the host's load_skill
 * tool because this environment has no file-read tool.
 */
export function formatSkillsForSystemPrompt(skills: Skill[]): string {
  const visible = skills.filter((skill) => !skill.disableModelInvocation);
  if (visible.length === 0) {
    return "";
  }
  const lines = [
    "The following skills provide specialized, battle-tested instructions for specific tasks.",
    "When your task matches a skill's description, first call the load_skill tool with that skill's name and follow its instructions.",
    "",
    "<available_skills>",
  ];
  for (const skill of visible) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(
      `    <description>${escapeXml(skill.description)}</description>`,
    );
    lines.push("  </skill>");
  }
  lines.push("</available_skills>");
  return lines.join("\n");
}

/**
 * Full instruction payload returned by the load_skill tool, mirroring pi's
 * formatSkillInvocation without the filesystem-location preamble.
 */
export function formatSkillPayload(skill: Skill): string {
  return `<skill name="${escapeXml(skill.name)}">\n\n${skill.content}\n\n</skill>`;
}
