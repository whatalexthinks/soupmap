/**
 * Noto Sans JP's @font-face rules are ~110 KB of CSS (124 unicode-range slices).
 * Load them after first paint so they never block rendering; Japanese text shows in
 * the system's Japanese font for a moment, then swaps (font-display: swap).
 */
export function loadJapaneseFont(): void {
  requestAnimationFrame(() => setTimeout(() => void import("@fontsource/noto-sans-jp/400.css"), 0));
}
