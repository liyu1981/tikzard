"use client";

/**
 * Thin wrapper around the JSXGraph library. Provides board creation and
 * re-exports the JXG namespace for use throughout the app.
 */
import JXG from "jsxgraph";

export { JXG };
export type Board = JXG.Board;
export type GeometryElement = JXG.GeometryElement;

export interface BoardOptions {
  boundingBox?: [number, number, number, number];
  keepAspectRatio?: boolean;
  axis?: boolean;
  grid?: boolean;
  showCopyright?: boolean;
  showNavigation?: boolean;
}

const DEFAULT_OPTIONS: BoardOptions = {
  boundingBox: [-5, 5, 5, -5],
  keepAspectRatio: true,
  axis: false,
  grid: false,
  showCopyright: false,
  showNavigation: false,
};

/**
 * Create a JSXGraph board in a container div.
 * @param container - DOM element to render into
 * @param options - board configuration
 * @returns the board instance
 */
export function createBoard(
  container: HTMLElement,
  options?: BoardOptions,
): Board {
  // Ensure the container has dimensions for JSXGraph to render into
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.minHeight = "200px";

  return JXG.JSXGraph.initBoard(container, {
    boundingbox: options?.boundingBox ?? DEFAULT_OPTIONS.boundingBox,
    keepaspectratio:
      options?.keepAspectRatio ?? DEFAULT_OPTIONS.keepAspectRatio,
    axis: options?.axis ?? DEFAULT_OPTIONS.axis,
    grid: options?.grid ?? DEFAULT_OPTIONS.grid,
    showCopyright: options?.showCopyright ?? DEFAULT_OPTIONS.showCopyright,
    showNavigation: options?.showNavigation ?? DEFAULT_OPTIONS.showNavigation,
  });
}
