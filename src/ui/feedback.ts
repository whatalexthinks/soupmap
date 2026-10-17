/** Loader (steam), and a small toast for confirmations. */
import { t } from "../i18n.ts";
import { $ } from "./dom.ts";

export class Loader {
  private readonly el = $("#loader");
  private readonly text = $("#loader-text");
  private slowTimer = window.setTimeout(() => this.setText(t("loadingSlow")), 9000);

  setText(text: string): void {
    this.text.textContent = text;
  }

  done(): void {
    clearTimeout(this.slowTimer);
    this.el.setAttribute("data-done", "");
    window.setTimeout(() => this.el.remove(), 700);
  }

  fail(message: string): void {
    clearTimeout(this.slowTimer);
    this.setText(message);
    this.el.querySelector(".loader__steam")?.remove();
  }
}

let toastTimer = 0;

export function toast(message: string, ms = 2200): void {
  const el = $("#toast");
  el.textContent = message;
  el.setAttribute("data-show", "");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.removeAttribute("data-show"), ms);
}
