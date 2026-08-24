/**
 * Minimal line-diff helper for the version browser's compare view. Builds a
 * simple longest-common-subsequence diff over whole lines and formats the
 * result as unified-style hunks (with a small context window) that the UI
 * can render as removed/added lines.
 */
export interface DiffLine {
  /** Stable unique id for use as a React key. */
  id: number;
  type: "context" | "add" | "remove";
  text: string;
}

export interface DiffHunk {
  /** Stable unique id for use as a React key. */
  id: number;
  /** 1-based line number in the old text where this hunk begins. */
  oldStart: number;
  /** Number of old lines covered by this hunk. */
  oldLines: number;
  /** 1-based line number in the new text where this hunk begins. */
  newStart: number;
  /** Number of new lines covered by this hunk. */
  newLines: number;
  lines: DiffLine[];
}

const CONTEXT = 3;

/** Split text into lines, ignoring a single trailing newline. */
function splitLines(text: string): string[] {
  return text.replace(/\n$/, "").split("\n");
}

/**
 * Compute the minimal edit script between two line arrays using the classic
 * dynamic-programming LCS (two rows to keep memory low). Returns the diff
 * lines in output order with old/new line cursors per line.
 */
interface ScriptLine {
  type: "context" | "add" | "remove";
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

function lineDiff(a: string[], b: string[]): ScriptLine[] {
  const n = a.length;
  const m = b.length;
  let prev = new Array<number>(m + 1).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    const cur = new Array<number>(m + 1).fill(0);
    for (let j = m - 1; j >= 0; j -= 1) {
      cur[j] = a[i] === b[j] ? prev[j + 1] + 1 : Math.max(prev[j], cur[j + 1]);
    }
    prev = cur;
  }
  const out: ScriptLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "context", text: a[i], oldNo: i, newNo: j });
      i += 1;
      j += 1;
    } else if (prev[j + 1] >= prev[j]) {
      out.push({ type: "remove", text: a[i], oldNo: i, newNo: null });
      i += 1;
    } else {
      out.push({ type: "add", text: b[j], oldNo: null, newNo: j });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ type: "remove", text: a[i], oldNo: i, newNo: null });
    i += 1;
  }
  while (j < m) {
    out.push({ type: "add", text: b[j], oldNo: null, newNo: j });
    j += 1;
  }
  return out;
}

/** Wrap a flat diff into unified hunks with a small context window. */
export function diffTexts(oldText: string, newText: string): DiffHunk[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const script = lineDiff(a, b);

  // Find the change positions so we can attach leading/trailing context.
  const changeAt = script.map((line) => line.type !== "context");
  const hunks: DiffHunk[] = [];
  let lineId = 0;
  let i = 0;
  while (i < script.length) {
    if (!changeAt[i]) {
      i += 1;
      continue;
    }
    // Start of a change group: back up to capture up to CONTEXT context lines.
    const start = Math.max(0, i - CONTEXT);
    // End of the change group (consecutive changed lines), then forward for
    // up to CONTEXT trailing context lines.
    let end = i;
    while (end < script.length && changeAt[end]) {
      end += 1;
    }
    end = Math.min(script.length, end + CONTEXT);
    // Collapse the group so overlapping expansions don't double-emit.
    const chunk = script.slice(start, end);
    const firstOld = chunk.find((l) => l.oldNo !== null)?.oldNo ?? 0;
    const firstNew = chunk.find((l) => l.newNo !== null)?.newNo ?? 0;
    hunks.push({
      id: hunks.length,
      oldStart: firstOld + 1,
      oldLines: chunk.filter((l) => l.oldNo !== null).length,
      newStart: firstNew + 1,
      newLines: chunk.filter((l) => l.newNo !== null).length,
      lines: chunk.map((l) => ({
        id: lineId++,
        type: l.type,
        text: l.text,
      })),
    });
    i = end;
  }
  return hunks;
}
