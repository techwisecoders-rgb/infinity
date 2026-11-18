"use client";

import { useEffect, useRef } from "react";
import { LEGACY_MARKUP } from "@/components/legacy-markup";

/**
 * The legacy page mutates its DOM extensively and includes inline event handlers.
 * Mount it after hydration so React never compares a browser-normalized legacy
 * fragment against server HTML (which caused the hydration warning).
 */
export default function InfinityLegacyApp() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // React renders an empty root on both server and first client render.
    // Inject the original markup only after hydration has finished.
    if (!root.hasChildNodes()) {
      root.innerHTML = LEGACY_MARKUP;
    }

    // Load the interaction layer once, only after its target markup exists.
    // The element-id guard also prevents duplicate execution in React Strict Mode.
    if (!document.getElementById("infinity-legacy-script")) {
      const script = document.createElement("script");
      script.id = "infinity-legacy-script";
      script.src = "/legacy.js";
      script.async = false;
      script.onerror = () => {
        console.error("Infinity interaction script failed to load from /legacy.js");
      };
      document.body.appendChild(script);
    }
  }, []);

  return <div id="infinity-app-root" ref={rootRef} />;
}
