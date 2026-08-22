"use client";

declare global {
  interface Window {
    TikzJaxOptions?: Record<string, unknown>;
  }
}

let pending: Promise<void> | null = null;

export function ensureTikzJax(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (!pending) {
    window.TikzJaxOptions = {
      renderTimeout: 30000,
      maxRetries: 1,
      restartWorkerOnFail: true,
      workerPool: {
        enabled: true,
        initializationRetries: 1,
      },
      theme: {
        // Render diagrams in their natural light scheme (black strokes):
        // never adapt SVG colors to the app's dark chrome. The non-matching
        // values below defeat every detection path (attribute, class,
        // data-bs-theme, data-color-scheme); followSystemTheme pins the
        // final fallback to light.
        followSystemTheme: false,
        attribute: "data-tikzjax-theme-disabled",
        darkClass: "tikzjax-dark-disabled",
        lightClass: "tikzjax-light-disabled",
      },
    };
    pending = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/tikzjax/tikzjax.min.js";
      script.async = true;
      script.addEventListener("load", () => resolve());
      script.addEventListener("error", () =>
        reject(new Error("failed to load the tikzjax runtime")),
      );
      document.head.appendChild(script);
    });
  }
  return pending;
}
