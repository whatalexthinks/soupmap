/**
 * Mobile search dock and browse sheet with three useful snap heights.
 */
import { $, isMobileLayout } from "./dom.ts";
import { sheetHeights, updateViewport } from "./viewport.ts";

type Snap = "peek" | "half" | "full";

export class BottomSheet {
  private readonly panel = $("#panel");
  private readonly handle = $<HTMLButtonElement>("#sheet-handle");
  private snap: Snap = "peek";
  private suppressClick = false;
  private wasMobile = isMobileLayout();
  private covered = false;
  private keyboardSnap: Snap | null = null;
  private stopDrag: (()=>void) | null = null;

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
    window.addEventListener("resize", () => {
      const mobile = isMobileLayout();
      if (mobile && !this.wasMobile) this.snap = "peek";
      this.wasMobile = mobile;
      this.stopDrag?.();
      this.apply();
    });
    window.visualViewport?.addEventListener("resize",()=>this.apply());
    window.visualViewport?.addEventListener("scroll",()=>this.apply());
    if(window.ResizeObserver) new window.ResizeObserver(()=>this.apply()).observe(document.querySelector(".masthead")!);
    this.apply();
  }

  private heights(): Record<Snap, number> {
    const v=updateViewport();
    return sheetHeights(v.height,v.header,v.credits,v.safeBottom,v.peek);
  }

  setSnap(snap: Snap): void {
    this.snap = snap;
    this.keyboardSnap=null;
    if(snap==="peek" && this.panel.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
    this.apply();
  }

  setCovered(covered:boolean):void {
    this.covered=covered;
    if(covered && isMobileLayout()) this.setSnap("peek");
    this.apply();
  }

  focusHandle():void { this.handle.focus({preventScroll:true}); }

  /** Expand at least to half height (e.g. when the search box is focused). */
  ensureOpen(): void {
    if (this.snap === "peek") this.setSnap("half");
  }

  private apply(): void {
    const viewport=updateViewport();
    const mobile=isMobileLayout();
    this.panel.toggleAttribute("data-covered",mobile && this.covered);
    this.panel.inert=mobile && this.covered;
    if (!isMobileLayout()) {
      this.keyboardSnap=null;
      this.panel.style.removeProperty("--sheet-h");
      this.panel.removeAttribute("data-snap");
      this.handle.setAttribute("aria-expanded", "true");
      this.handle.setAttribute("aria-label", "Shop list");
      this.handle.querySelector(".sr-only")!.textContent = "Shop list";
      return;
    }
    const keyboard=viewport.bottom>120 && (window.visualViewport?.scale ?? 1)===1;
    if(keyboard && this.panel.contains(document.activeElement) && this.keyboardSnap===null) {
      this.keyboardSnap=this.snap;
      this.snap="full";
    } else if(!keyboard && this.keyboardSnap!==null) {
      this.snap=this.keyboardSnap;
      this.keyboardSnap=null;
    }
    this.panel.style.setProperty("--sheet-h", `${this.heights()[this.snap]}px`);
    this.panel.setAttribute("data-snap", this.snap);
    this.handle.setAttribute("aria-expanded", String(this.snap !== "peek"));
    const label = this.snap === "peek" ? "Expand shop search and list" : this.snap === "full" ? "Collapse shop list" : "Show full shop list";
    this.handle.setAttribute("aria-label", label);
    this.handle.querySelector(".sr-only")!.textContent = label;
  }

  private startDrag(down: PointerEvent): void {
    if (!isMobileLayout() || down.button !== 0) return;
    const target = down.target as Element;
    const grip=down.currentTarget as Element;
    if (target.closest("a, input, select") || (target.closest("button") && !target.closest("#sheet-handle"))) return;
    this.stopDrag?.();
    const startY = down.clientY;
    const startH = this.panel.getBoundingClientRect().height;
    const h = this.heights();
    let lastY = startY;
    let lastT = performance.now();
    let velocity = 0;
    let moved = false;
    this.panel.setAttribute("data-dragging", "");
    grip.setPointerCapture?.(down.pointerId);

    const move = (e: PointerEvent) => {
      if(e.pointerId !== down.pointerId) return;
      const dy = startY - e.clientY;
      if (Math.abs(dy) > 4) moved = true;
      const now = performance.now();
      velocity = (lastY - e.clientY) / Math.max(now - lastT, 1);
      lastY = e.clientY;
      lastT = now;
      const height = Math.min(Math.max(startH + dy, h.peek), h.full);
      this.panel.style.setProperty("--sheet-h", `${height}px`);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel",cancel);
      this.panel.removeAttribute("data-dragging");
      this.stopDrag=null;
      if(grip.hasPointerCapture?.(down.pointerId)) grip.releasePointerCapture(down.pointerId);
    };
    const cancel = (event?:PointerEvent) => {
      if(event && event.pointerId !== down.pointerId) return;
      cleanup();
      this.apply();
    };
    const up = (event:PointerEvent) => {
      if(event.pointerId !== down.pointerId) return;
      cleanup();
      if (!moved) {
        this.apply();
        return;
      }
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false), 300);
      const current = this.panel.getBoundingClientRect().height;
      const projected = current + velocity * 180;
      const order: Snap[] = ["peek", "half", "full"];
      const nearest = order.reduce((best, s) => (Math.abs(h[s] - projected) < Math.abs(h[best] - projected) ? s : best), "peek" as Snap);
      this.setSnap(nearest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    this.stopDrag=cancel;
  }
}
