"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { XIcon } from "./icons";

interface ImageLightboxProps {
  src: string;
  alt: string;
  className: string;
}

/** Clickable image thumbnail with an in-app, keyboard-accessible full view. */
export function ImageLightbox({ src, alt, className }: ImageLightboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("agent.viewImage")}
        className="block cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        {/* biome-ignore lint/performance/noImgElement: base64 data URLs from IndexedDB can't go through next/image's server optimizer in this offline-first app */}
        <img src={src} alt={alt} draggable={false} className={className} />
      </button>
      {open &&
        createPortal(
          // biome-ignore lint/a11y/useKeyWithClickEvents: Escape and the close button provide keyboard dismissal for the backdrop
          <div
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md sm:p-8"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setOpen(false);
              }
            }}
          >
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("agent.close")}
              title={t("agent.close")}
              className="absolute right-4 top-4 rounded-full border border-white/20 bg-black/40 p-2 text-white/80 shadow-lg backdrop-blur-md transition hover:bg-black/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6 sm:top-6"
            >
              <XIcon className="size-5" />
            </button>
            {/* biome-ignore lint/performance/noImgElement: the lightbox displays the same in-memory data URL as its thumbnail */}
            <img
              src={src}
              alt={alt}
              draggable={false}
              className="max-h-[calc(100vh-2rem)] max-w-full rounded-xl object-contain shadow-2xl sm:max-h-[calc(100vh-4rem)]"
            />
          </div>,
          document.body,
        )}
    </>
  );
}
