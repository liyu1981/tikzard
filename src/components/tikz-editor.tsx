"use client";

import hljs from "highlight.js/lib/core";
import latex from "highlight.js/lib/languages/latex";
import { useEffect, useMemo, useRef, useState } from "react";

let registered = false;

function ensureLatex() {
  if (!registered) {
    hljs.registerLanguage("latex", latex);
    registered = true;
  }
}

const LINE_HEIGHT = 20;
const EDITOR_PADDING = 12;

export function TikzEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  ensureLatex();
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineStripRef = useRef<HTMLDivElement>(null);
  const [caretLine, setCaretLine] = useState(1);

  // highlight.js escapes the raw source before wrapping matches in spans.
  const html = useMemo(
    () => hljs.highlight(value, { language: "latex" }).value,
    [value],
  );

  // No soft wrapping: one logical line is one visual row, so the gutter,
  // the highlighted overlay, and the caret always stay aligned.
  const lineCount = useMemo(() => value.split("\n").length, [value]);

  const syncOverlays = () => {
    const pre = preRef.current;
    const gutter = gutterRef.current;
    const textarea = textareaRef.current;
    if (!pre || !gutter || !textarea) {
      return;
    }
    pre.scrollTop = textarea.scrollTop;
    pre.scrollLeft = textarea.scrollLeft;
    gutter.scrollTop = textarea.scrollTop;

    const line = value
      .slice(0, textarea.selectionStart ?? 0)
      .split("\n").length;
    setCaretLine(line);
    const strip = lineStripRef.current;
    if (strip) {
      strip.style.transform = `translateY(${
        EDITOR_PADDING + (line - 1) * LINE_HEIGHT - textarea.scrollTop
      }px)`;
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: resync overlays whenever the highlighted content changes
  useEffect(() => {
    syncOverlays();
  }, [html]);

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border/40 bg-background/40">
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="w-12 shrink-0 overflow-hidden border-r border-border/40 bg-background/20 py-3 pr-2 text-right font-mono text-sm leading-5 text-muted-foreground select-none"
      >
        {Array.from({ length: lineCount }, (_, i) => i + 1).map((line) => (
          <div
            key={line}
            className={
              line === caretLine ? "font-medium text-foreground" : undefined
            }
          >
            {line}
          </div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div
          ref={lineStripRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-foreground/[0.06]"
        />
        <pre
          ref={preRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden p-3 font-mono text-sm whitespace-pre leading-5"
        >
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escapes the raw source before wrapping tokens */}
          <code dangerouslySetInnerHTML={{ __html: `${html}\n` }} />
        </pre>
        <textarea
          ref={textareaRef}
          id="tikz-source"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onSelect={syncOverlays}
          onScroll={syncOverlays}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          className="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-3 font-mono text-sm whitespace-pre leading-5 text-transparent caret-foreground outline-none"
        />
      </div>
    </div>
  );
}
