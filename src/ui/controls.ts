/** Floating map controls, fallback style switch and temporary notices. */
import type { EngineStatus, FallbackStyle } from "../map/types.ts";
import { t } from "../i18n.ts";
import { $, esc } from "./dom.ts";

export interface ControlHandlers {
  onOverview(): void;
  onZoom(direction: 1 | -1): void;
  onTilt(): boolean | undefined;
  onNorth(): void;
  onBuildingToggle(): void;
  onFallbackStyle(style: FallbackStyle): void;
}

export class MapControls {
  private status: EngineStatus | null = null;
  private flashTimer = 0;
  private readonly chip = $("#status-chip");
  private readonly styleSwitch = $("#fallback-style");
  private readonly building = $<HTMLButtonElement>("#building-toggle");

  constructor(handlers: ControlHandlers) {
    this.setEnabled(false);
    $('#zoom-in').addEventListener('click', () => handlers.onZoom(1));
    $('#zoom-out').addEventListener('click', () => handlers.onZoom(-1));
    $('#north-btn').addEventListener('click', () => handlers.onNorth());
    $('#tilt-btn').addEventListener('click', () => {
      const overhead = handlers.onTilt() ?? false;
      $('#tilt-btn').setAttribute('aria-pressed', String(overhead));
      $('#tilt-btn').textContent = overhead ? '3D' : '2D';
      $('#tilt-btn').setAttribute('aria-label', overhead ? 'Switch to tilted view' : 'Switch to overhead view');
    });
    $("#overview-btn").addEventListener("click", () => handlers.onOverview());
    this.building.addEventListener("click", () => handlers.onBuildingToggle());
    this.styleSwitch.addEventListener("click", (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>("[data-style]");
      if (!btn) return;
      const style = btn.dataset.style as FallbackStyle;
      for (const b of this.styleSwitch.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === btn));
      handlers.onFallbackStyle(style);
    });
    for (const b of this.styleSwitch.querySelectorAll<HTMLButtonElement>("button")) {
      b.textContent = b.dataset.style === "photo" ? t("fallbackPhoto") : t("fallbackMap");
    }
    this.styleSwitch.setAttribute("aria-label", t("fallbackStyleLabel"));
  }

  setEnabled(enabled: boolean): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>('#controls button')) button.disabled = !enabled;
  }

  setStatus(status: EngineStatus): void {
    this.status = status;
    clearTimeout(this.flashTimer);
    this.renderStatus();
  }

  private renderStatus(): void {
    const fallback = this.status?.kind === 'ready' && this.status.mode === 'fallback';
    this.styleSwitch.hidden = !fallback;
    // No permanent rendering-mode badge. Keep this live region only for
    // temporary, actionable notices; Cesium owns the required map attribution.
    this.chip.hidden = true;
    this.chip.replaceChildren();
    this.chip.removeAttribute("title");
  }

  flash(message: string, ms = 4000): void {
    clearTimeout(this.flashTimer);
    this.chip.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${esc(message)}</span>`;
    this.chip.hidden = false;
    this.flashTimer = window.setTimeout(() => this.renderStatus(), ms);
  }

  setBuildingToggle(visible: boolean, pressed: boolean): void {
    this.building.hidden = !visible;
    this.building.setAttribute("aria-pressed", String(pressed));
  }
}
