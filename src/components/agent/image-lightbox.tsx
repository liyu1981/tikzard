import { atom, useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { XIcon } from "@/components/agent/icons";

export interface LightboxImage {
  src: string;
  alt: string;
}

/** The image currently shown in the lightbox, or null when it is closed. */
export const imageLightboxAtom = atom<LightboxImage | null>(null);

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/**
 * Full-screen image viewer with zoom. Any image in the agent panel (composer
 * attachment or message) opens it by setting {@link imageLightboxAtom}.
 */
export function ImageLightbox() {
  const { t } = useTranslation();
  const [image, setImage] = useAtom(imageLightboxAtom);
  const [zoom, setZoom] = useState(1);

  const close = useCallback(() => setImage(null), [setImage]);
  const zoomIn = useCallback(
    () => setZoom((z) => clampZoom(z * ZOOM_STEP)),
    [],
  );
  const zoomOut = useCallback(
    () => setZoom((z) => clampZoom(z / ZOOM_STEP)),
    [],
  );
  const reset = useCallback(() => setZoom(1), []);

  // Reset zoom whenever a new image opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on image change
  useEffect(() => {
    setZoom(1);
  }, [image?.src]);

  // Escape closes; +/-/0 adjust zoom; lock page scroll while open.
  useEffect(() => {
    if (image === null) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      } else if (event.key === "+" || event.key === "=") {
        zoomIn();
      } else if (event.key === "-") {
        zoomOut();
      } else if (event.key === "0") {
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [image, close, zoomIn, zoomOut, reset]);

  if (image === null) {
    return null;
  }

  const buttonClass =
    "flex size-8 items-center justify-center rounded-full border border-white/20 bg-black/40 text-lg leading-none text-white transition duration-150 hover:bg-black/60 active:scale-95";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.alt || t("agent.viewImage")}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/85 p-4 backdrop-blur-sm"
    >
      {/* Full-screen backdrop: clicking the empty area closes the viewer. */}
      <button
        type="button"
        aria-label={t("agent.close")}
        tabIndex={-1}
        onClick={close}
        className="absolute inset-0 cursor-zoom-out"
      />

      <button
        type="button"
        aria-label={t("agent.close")}
        title={t("agent.close")}
        onClick={close}
        className={`${buttonClass} absolute top-4 right-4 z-10`}
      >
        <XIcon className="size-4" />
      </button>

      <img
        src={image.src}
        alt={image.alt}
        draggable={false}
        style={{ transform: `scale(${zoom})` }}
        className="relative z-10 max-h-[84vh] max-w-[92vw] rounded-lg shadow-2xl transition-transform duration-150"
      />

      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/20 bg-black/50 px-1.5 py-1 backdrop-blur-md">
        <button
          type="button"
          aria-label={t("workbench.zoomOut")}
          title={t("workbench.zoomOut")}
          onClick={zoomOut}
          className={buttonClass}
        >
          −
        </button>
        <button
          type="button"
          aria-label={t("workbench.zoomReset")}
          title={t("workbench.zoomReset")}
          onClick={reset}
          className="min-w-14 rounded-full px-2 py-1.5 text-center font-mono text-xs tabular-nums text-white transition duration-150 hover:bg-white/10"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label={t("workbench.zoomIn")}
          title={t("workbench.zoomIn")}
          onClick={zoomIn}
          className={buttonClass}
        >
          +
        </button>
      </div>
    </div>,
    document.body,
  );
}
