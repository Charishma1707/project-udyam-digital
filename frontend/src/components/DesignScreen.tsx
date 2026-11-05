import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";

export type ScreenModule = {
  theme: string | null;
  bodyClass: string;
  html: string;
  script: string;
  globals: string[];
};

/** Visible label of a clickable element, ignoring icon glyph names and badge counts. */
function labelOf(el: HTMLElement) {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".material-symbols-outlined, svg").forEach((n) => n.remove());
  const aria = el.getAttribute("aria-label");
  const text = (clone.textContent ?? "").replace(/(?<!\()\b\d+\b(?!\))/g, "").replace(/\s+/g, " ").trim();
  return { aria, text };
}

/**
 * Renders one imported design screen with its original markup and behavior.
 * `nav` maps a button/link label to an app path.
 */
export function DesignScreen({ screen, nav = {} }: { screen: ScreenModule; nav?: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!screen.script) return;
    const w = window as unknown as Record<string, unknown>;
    const exportNames = screen.globals.map((n) => `try{window[${JSON.stringify(n)}]=${n}}catch(e){}`).join(";");
    try {
      new Function(`${screen.script}\n;${exportNames}`)();
    } catch (e) {
      console.error("Screen script failed", e);
    }
    return () => {
      screen.globals.forEach((n) => delete w[n]);
    };
  }, [screen]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest("a, button") as HTMLElement | null;
      if (!el || !root.contains(el)) return;
      const href = el.getAttribute("href");
      if (href?.startsWith("/")) {
        e.preventDefault();
        navigate({ to: href });
        return;
      }
      const { aria, text } = labelOf(el);
      const to = (aria && nav[aria]) || nav[text];
      if (to) {
        e.preventDefault();
        e.stopPropagation();
        navigate({ to });
      }
    };
    root.addEventListener("click", onClick, true);
    return () => root.removeEventListener("click", onClick, true);
  }, [nav, navigate]);

  return (
    <div
      ref={ref}
      className={`${screen.theme ?? ""} ${screen.bodyClass} min-h-screen`}
      dangerouslySetInnerHTML={{ __html: screen.html }}
    />
  );
}
