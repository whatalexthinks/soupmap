/**
 * Mobile bottom sheet for the panel: three snap heights (peek, half, full),
 * draggable by the handle and header, togglable with the keyboard.
 */
import { $, isMobileLayout } from "./dom.ts";

type Snap = "peek" | "half" | "full";

export class BottomSheet {
  private readonly panel = $("#panel");
  private readonly handle = $<HTMLButtonElement>("#sheet-handle");
  private snap: Snap = "peek";
  private suppressClick = false;

  constructor() {
    const grips = [this.handle, $(".panel__header", this.panel)];
    for (const grip of grips) grip.addEventListener("pointerdown", (e) => this.startDrag(e));
    // Taps and keyboard both arrive as clicks; a click right after a drag is ignored.
    this.handle.addEventListener("click", () => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      this.setSnap(this.snap === "peek" ? "half" : this.snap === "half" ? "full" : "peek");
    });
    window.addEventListener("resize", () => this.apply());
    this.apply();
  }

  private heights(): Record<Snap, number> {
    const credit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--credit-h")) || 34;
    const peek = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sheet-peek")) || 172;
    const vh = window.innerHeight;
    return { peek, half: Math.round(vh * 0.52), full: vh - 64 - credit };
  }

  setSnap(snap: Snap): void {
    this.snap = snap;
    this.apply();
  }

  /** Expand at least to half height (e.g. when the search box is focused). */
  ensureOpen(): void {
    if (this.snap === "peek") this.setSnap("half");
  }

  private apply(): void {
    if (!isMobileLayout()) {
      this.panel.style.removeProperty("--sheet-h");
      this.handle.setAttribute("aria-expanded", "true");
      return;
    }
    this.panel.style.setProperty("--sheet-h", `${this.heights()[this.snap]}px`);
    this.handle.setAttribute("aria-expanded", String(this.snap !== "peek"));
  }

  private startDrag(down: PointerEvent): void {
    if (!isMobileLayout() || down.button !== 0) return;
    const target = down.target as Element;
    if (target.closest("a, input")) return;
    const startY = down.clientY;
    const startH = this.panel.getBoundingClientRect().height;
    const h = this.heights();
    let lastY = startY;
    let lastT = performance.now();
    let velocity = 0;
    let moved = false;
    this.panel.setAttribute("data-dragging", "");
    (down.currentTarget as Element).setPointerCapture?.(down.pointerId);

    const move = (e: PointerEvent) => {
      const dy = startY - e.clientY;
      if (Math.abs(dy) > 4) moved = true;
      const now = performance.now();
      velocity = (lastY - e.clientY) / Math.max(now - lastT, 1);
      lastY = e.clientY;
      lastT = now;
      const height = Math.min(Math.max(startH + dy, h.peek), h.full);
      this.panel.style.setProperty("--sheet-h", `${height}px`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      this.panel.removeAttribute("data-dragging");
      if (!moved) {
        this.apply();
        return;
      }
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false), 0);
      const current = this.panel.getBoundingClientRect().height;
      const projected = current + velocity * 180;
      const order: Snap[] = ["peek", "half", "full"];
      const nearest = order.reduce((best, s) => (Math.abs(h[s] - projected) < Math.abs(h[best] - projected) ? s : best), "peek" as Snap);
      this.setSnap(nearest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
}
