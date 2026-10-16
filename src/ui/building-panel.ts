/** The PLATEAU "Building info" panel: plain-English facts about the picked building. */
import type { BuildingFacts } from "../map/plateau-attributes";
import { getSource } from "../sources";
import { t } from "../i18n";
import { $, esc } from "./dom";
import { icon } from "./icons";

export type BuildingPanelState =
  | { kind: "loading" }
  | { kind: "hint" }
  | { kind: "facts"; facts: BuildingFacts };

export interface BuildingPanelHandlers {
  onClose(): void;
  onDataView(): void;
}

function factsHtml(facts: BuildingFacts): string {
  const rows: Array<[string, string | undefined]> = [
    ["Use", facts.usage],
    ["Year built", facts.yearBuilt],
    ["Height", facts.height],
    ["Storeys", facts.storeys],
    ["Structure", facts.structure],
    ...facts.hazards.map((h): [string, string] => [h.label, h.detail]),
  ];
  const shown = rows.filter((r): r is [string, string] => !!r[1]);
  if (!shown.length) return `<p>${esc(t("buildingNoAttributes"))}</p>`;
  const title = facts.name ? `<p lang="ja">${esc(facts.name)}</p>` : "";
  return `${title}<dl class="facts">${shown.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
}

export class BuildingPanel {
  private readonly el = $("#building-panel");

  constructor(handlers: BuildingPanelHandlers) {
    this.el.addEventListener("click", (e) => {
      const action = (e.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action;
      if (action === "close") handlers.onClose();
      if (action === "data-view") handlers.onDataView();
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  show(state: BuildingPanelState, dataView: boolean): void {
    const plateau = getSource("plateau-buildings");
    const body =
      state.kind === "loading"
        ? `<p>${esc(t("buildingLoading"))}</p>`
        : state.kind === "hint"
          ? `<p>${esc(t("buildingHint"))}</p>`
          : factsHtml(state.facts);
    this.el.innerHTML = `
      <h2 id="building-title">${esc(t("buildingTitle"))}</h2>
      <button type="button" class="icon-btn" data-action="close" aria-label="Turn off building info" title="${esc(t("close"))}">${icon("close")}</button>
      ${body}
      ${dataView ? `<p class="building__credit">${esc(t("buildingDataViewNote"))}</p>` : ""}
      <div class="actions"><button type="button" class="btn" data-action="data-view" aria-pressed="${dataView}">${icon("building")}${esc(t("buildingDataView"))}</button></div>
      <p class="building__credit"><a href="${plateau.attributionUrl}" target="_blank" rel="noopener" lang="ja">${esc(plateau.attribution)}</a> · ${esc(plateau.license)} · restyled by Soupmap</p>`;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
    this.el.innerHTML = "";
  }
}
