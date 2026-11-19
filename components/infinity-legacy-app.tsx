"use client";

import { useEffect, useRef } from "react";
import { LEGACY_MARKUP } from "@/components/legacy-markup";
import WordEditorOverlay from "@/components/word-editor-overlay";

/**
 * Mounts the original single-page Infinity interface after hydration.
 * The legacy application uses inline onclick attributes and direct DOM updates,
 * so it is intentionally mounted as one isolated legacy DOM subtree.
 */
export default function InfinityLegacyApp() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (!root.dataset.legacyMounted) {
      root.innerHTML = LEGACY_MARKUP;
      root.dataset.legacyMounted = "true";
    }

    const scriptId = "infinity-legacy-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "/legacy.js";
      script.async = false;
      script.onerror = () => {
        console.error("Infinity interaction script failed to load from /legacy.js");
      };
      document.body.appendChild(script);
    }

    return () => {
      // Keep the injected legacy DOM and script alive across React Strict Mode's
      // development effect cleanup/re-run. The page is a single-page legacy app.
    };
  }, []);

  return (
    <>
      <div id="infinity-app-root" ref={rootRef} style={{ display: "contents" }} />
      <WordEditorOverlay />
    </>
  );
}
