/** Tiny DOM helpers. All dynamic text goes through `esc` before reaching innerHTML. */

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

export function $<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

export function prefersReducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isMobileLayout(): boolean {
  return matchMedia("(max-width: 760px)").matches
    || matchMedia("(max-height: 500px) and (max-width: 1024px)").matches;
}
