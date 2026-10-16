/** Full-screen "Step inside" modal. Loads three.js + Spark only when opened. */
import type { Shop } from "../data/shops.ts";
import type { SplatViewer } from "../splat/viewer.ts";
import { t } from "../i18n.ts";
import { esc, prefersReducedMotion } from "./dom.ts";

export class SplatModal {
  private dialog: HTMLDialogElement | null = null;
  private viewer: SplatViewer | null = null;
  private returnFocus: HTMLElement | null = null;
  private session = 0;

  get open(): boolean {
    return !!this.dialog?.open;
  }

  async show(shop: Shop): Promise<void> {
    if (!shop.splatUrl || this.open) return;
    const session = ++this.session;
    this.returnFocus = document.activeElement as HTMLElement | null;

    const dialog = document.createElement("dialog");
    dialog.className = "splat";
    dialog.setAttribute("aria-labelledby", "splat-title");
    dialog.innerHTML = `
      <div class="splat__canvas" tabindex="0"></div>
      <div class="splat__bar glass">
        <span class="pano__label"><strong id="splat-title">${esc(t("splatTitle"))}</strong> · ${esc(shop.name)}</span>
        <button type="button" class="btn btn--primary" data-action="close">${esc(t("backToMap"))}</button>
      </div>
      <p class="splat__note glass" role="status">${esc(t("splatLoading"))}</p>`;
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.close();
    });
    dialog.querySelector('[data-action="close"]')?.addEventListener("click", () => this.close());
    document.body.append(dialog);
    this.dialog = dialog;
    dialog.showModal();

    const note = dialog.querySelector<HTMLElement>(".splat__note");
    try {
      const { openSplatViewer } = await import("../splat/viewer.ts");
      const container = dialog.querySelector<HTMLElement>(".splat__canvas");
      if (!container || session !== this.session) return;
      const viewer = await openSplatViewer(container, shop.splatUrl, { reducedMotion: prefersReducedMotion() });
      if (session !== this.session) {
        viewer.dispose();
        return;
      }
      this.viewer = viewer;
      if (note) {
        if (shop.splatUrl.startsWith("procedural:")) note.textContent = t("splatPlaceholder");
        else note.hidden = true;
      }
    } catch (error) {
      console.warn("[soupmap] splat viewer failed", error);
      if (note && session === this.session) note.textContent = t("splatFailed");
    }
  }

  close(): void {
    this.session++;
    this.viewer?.dispose();
    this.viewer = null;
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
    this.returnFocus?.focus();
  }
}
