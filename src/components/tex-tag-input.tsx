"use client";

import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { XIcon } from "@/components/agent/icons";

export interface TagSuggestion {
  id: string;
  /** Optional one-line blurb shown next to the id in the dropdown. */
  description?: string;
}

interface Props {
  label: string;
  placeholder: string;
  removeLabel: (id: string) => string;
  /** Fallback blurb when a suggestion has none of its own. */
  genericDescription: string;
  suggestions: TagSuggestion[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Tags-input style multi-select for TeX-level selections (packages, TikZ
 * libraries). Selected ids render as removable chips; typing filters the
 * suggestion list (typeahead) and Enter/click adds the highlighted one.
 * Only known ids can be added — unknown text simply finds no match.
 */
export function TexTagInput({
  label,
  placeholder,
  removeLabel,
  genericDescription,
  suggestions,
  selected,
  onChange,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suggestions.filter(
      (item) =>
        !selected.includes(item.id) &&
        (q === "" ||
          item.id.toLowerCase().includes(q) ||
          (item.description ?? "").toLowerCase().includes(q)),
    );
  }, [query, selected, suggestions]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const add = (id: string) => {
    if (!suggestions.some((item) => item.id === id)) {
      return;
    }
    onChange(selected.includes(id) ? selected : [...selected, id]);
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, matches.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      const highlighted = matches[activeIndex];
      const exact = suggestions.find(
        (item) => item.id.toLowerCase() === query.trim().toLowerCase(),
      );
      if (highlighted !== undefined) {
        add(highlighted.id);
      } else if (exact !== undefined) {
        add(exact.id);
      }
      return;
    }
    if (event.key === "Escape") {
      setQuery("");
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <label className="flex min-h-[2.25rem] w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-border/40 bg-background/40 px-2 py-1 transition-colors focus-within:border-ring">
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          {label}
        </span>
        {selected.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2 pr-1 font-mono text-xs text-primary"
          >
            {id}
            <button
              type="button"
              aria-label={removeLabel(id)}
              onClick={() => onChange(selected.filter((p) => p !== id))}
              className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={label}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 font-mono text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </label>
      {open && matches.length > 0 && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-background/95 p-1 shadow-lg backdrop-blur-md"
        >
          {matches.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(event) => {
                // Prevent blur so the input keeps focus after adding.
                event.preventDefault();
                add(item.id);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                index === activeIndex
                  ? "bg-primary/10"
                  : "hover:bg-foreground/[0.06]"
              }`}
            >
              <span className="font-mono text-xs font-medium">{item.id}</span>
              <span className="min-w-0 flex-1 truncate text-[0.7rem] text-muted-foreground">
                {item.description ?? genericDescription}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
