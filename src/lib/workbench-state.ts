"use client";

import type { ImageContent } from "@earendil-works/pi-ai";
import { atom } from "jotai";

export const EXAMPLE_CODE = `// Parabola y = x²/4
board.create('axis', [[0, 0], [1, 0]], {
  name: 'x', withLabel: true, label: { position: 'right' }
});
board.create('axis', [[0, 0], [0, 1]], {
  name: 'y', withLabel: true, label: { position: 'top' }
});
board.create('functiongraph',
  [x => 0.25 * x * x, 0, 3],
  { strokeColor: '#2563eb', strokeWidth: 2 }
);`;

/** Starter source used when the user creates a new document. */
export const NEW_DOCUMENT_CODE = `// Start drawing here
board.create('axis', [[0, 0], [1, 0]], {
  name: 'x', withLabel: true, label: { position: 'right' }
});
board.create('axis', [[0, 0], [0, 1]], {
  name: 'y', withLabel: true, label: { position: 'top' }
});
`;

export type LeftTab = "instruction" | "assistant";

/**
 * Which top-level view fills the content area: while IndexedDB is being
 * checked ("loading") nothing renders, first-run users with zero stored
 * documents land on the welcome page, everyone else gets the workbench.
 */
export type EntryGate = "loading" | "welcome" | "workbench";

export const entryGateAtom = atom<EntryGate>("loading");

/**
 * Shared workbench state (jotai). The JSXGraph source lives here so the
 * editor, the preview, and the AI assistant's mutation bridge always observe
 * the same value regardless of which left-panel tab is mounted.
 */
export const codeAtom = atom(EXAMPLE_CODE);

export const docTitleAtom = atom("Untitled");

export const currentDocIdAtom = atom<string | null>(null);

export const leftTabAtom = atom<LeftTab>("assistant");

/**
 * An annotated preview snapshot waiting to be staged in the AI assistant
 * composer: the workbench produces the merged picture on "Finish", the chat
 * consumes it (fills the input text and replaces attachments, never sends)
 * and clears the atom.
 */
export interface PendingAnnotation {
  id: string;
  content: ImageContent;
  promptText: string;
}

export const pendingAnnotationAtom = atom<PendingAnnotation | null>(null);
