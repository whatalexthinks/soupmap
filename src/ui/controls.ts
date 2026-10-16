/** Floating map controls: status chip, fallback style switch, building info, overview. */
import type { EngineStatus, FallbackStyle } from "../map/types";
import { t } from "../i18n";
import { $, esc } from "./dom";

export interface ControlHandlers {
  onOverview(): void;
  onBuildingToggle(): void;
  onFallbackStyle(style: FallbackStyle): void;
}

export class MapControls {
  private readonly chip = $("#status-chip");
  private readonly styleSwitch = $("#fallback-style");
  private readonly building = $<HTMLButtonElement>("#building-toggle");

  constructor(handlers: ControlHandlers) {
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

  setStatus(status: EngineStatus): void {
    if (status.kind === "ready" && status.mode === "fallback") {
      this.chip.innerHTML = `<span class="dot" aria-hidden="true"></span><span><strong>${esc(t("fallbackTitle"))}</strong> · ${esc(t("fallbackBody"))}</span>`;
      this.chip.title = status.reason ?? "";
      this.chip.hidden = false;
      this.styleSwitch.hidden = false;
    } else {
      this.chip.hidden = true;
      this.styleSwitch.hidden = true;
    }
  }

  /** A short-lived note in the chip (e.g. "Building data unavailable"). */
  flash(message: string, ms = 4000): void {
    const previous = { html: this.chip.innerHTML, hidden: this.chip.hidden };
    this.chip.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${esc(message)}</span>`;
    this.chip.hidden = false;
    window.setTimeout(() => {
      this.chip.innerHTML = previous.html;
      this.chip.hidden = previous.hidden;
    }, ms);
  }

  setBuildingToggle(visible: boolean, pressed: boolean): void {
    this.building.hidden = !visible;
    this.building.setAttribute("aria-pressed", String(pressed));
  }
}
