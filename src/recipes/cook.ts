/**
 * A recipe page in use: scale servings, switch units, tick ingredients, run timers from the
 * method, cook step by step with the screen kept awake, save the recipe and keep notes.
 */
import { esc } from "../ui/dom.ts";
import { trackEvent } from "../analytics.ts";
import { formatAmount, scaleAmount, type Amount, type System, type Unit } from "./quantity.ts";
import { checkedIngredients, checkedSteps, preferredUnits, recipeNote, savedRecipes, setCheckedIngredients, setCheckedSteps, setPreferredUnits, setRecipeNote, setRecipeSaved, loadRecipeStorage } from "./storage.ts";

const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};

interface Timer { id: number; label: string; total: number; ends: number; left: number; paused: boolean; done: boolean }

/** Countdown timers that keep running while you scroll, shown in a small tray. */
export class Timers {
  private timers: Timer[] = [];
  private next = 1;
  private tick = 0;
  readonly tray: HTMLElement;

  constructor(private readonly doc: Document, private readonly now: () => number = () => Date.now()) {
    this.tray = doc.createElement("div");
    this.tray.className = "r-timers";
    this.tray.setAttribute("aria-live", "polite");
    this.tray.setAttribute("aria-label", "Timers");
    this.tray.hidden = true;
    doc.body.append(this.tray);
    this.tray.addEventListener("click", e => {
      const button = (e.target as Element).closest<HTMLElement>("[data-timer]");
      if (!button) return;
      const timer = this.timers.find(t => t.id === Number(button.dataset.timer));
      if (!timer) return;
      if (button.dataset.op === "pause") {
        if (timer.paused) { timer.ends = this.now() + timer.left * 1000; timer.paused = false; }
        else { timer.left = (timer.ends - this.now()) / 1000; timer.paused = true; }
      } else this.timers = this.timers.filter(t => t !== timer);
      this.render();
    });
  }

  start(seconds: number, label: string): void {
    this.timers.push({ id: this.next++, label, total: seconds, ends: this.now() + seconds * 1000, left: seconds, paused: false, done: false });
    trackEvent("recipe_timer_started", { minutes: Math.round(seconds / 60) });
    this.render();
    if (!this.tick) this.tick = window.setInterval(() => this.render(), 500);
  }

  get count(): number { return this.timers.length; }

  render(): void {
    for (const t of this.timers) {
      if (!t.paused) t.left = (t.ends - this.now()) / 1000;
      if (!t.done && t.left <= 0) { t.done = true; this.ring(t); }
    }
    this.tray.hidden = !this.timers.length;
    if (!this.timers.length && this.tick) { clearInterval(this.tick); this.tick = 0; }
    this.tray.innerHTML = this.timers.map(t => `<div class="r-timers__item${t.done ? " is-done" : ""}">
      <span class="r-timers__time">${t.done ? "Done" : clock(t.left)}</span><span class="r-timers__label">${esc(t.label)}</span>
      ${t.done ? "" : `<button type="button" data-timer="${t.id}" data-op="pause">${t.paused ? "Resume" : "Pause"}</button>`}
      <button type="button" data-timer="${t.id}" data-op="clear" aria-label="${t.done ? "Dismiss" : "Cancel"} timer: ${esc(t.label)}">${t.done ? "OK" : "×"}</button></div>`).join("");
  }

  private ring(timer: Timer): void {
    try { navigator.vibrate?.([300, 150, 300]); } catch { /* not on this device */ }
    try {
      const audio = new AudioContext();
      for (const [at, freq] of [[0, 880], [0.35, 880], [0.7, 1175]] as const) {
        const tone = audio.createOscillator(), gain = audio.createGain();
        tone.frequency.value = freq;
        gain.gain.setValueAtTime(0.18, audio.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + at + 0.3);
        tone.connect(gain).connect(audio.destination);
        tone.start(audio.currentTime + at);
        tone.stop(audio.currentTime + at + 0.32);
      }
      setTimeout(() => void audio.close(), 1500);
    } catch { /* no audio */ }
    if (this.doc.hidden && "Notification" in window && Notification.permission === "granted") {
      try { new Notification("Soupmap timer", { body: `${timer.label} is done.` }); } catch { /* ignore */ }
    }
  }
}

export function setupRecipe(doc: Document): void {
  const article = doc.querySelector<HTMLElement>(".r-recipe");
  if (!article) return;
  const slug = article.dataset.recipe!;
  const base = Number(article.dataset.serves);
  let serves = base;
  let units: System = preferredUnits();
  const title = doc.querySelector(".r-title")?.textContent?.trim() ?? "Recipe";

  // ── Scale and units ──
  const output = doc.querySelector<HTMLOutputElement>("#r-serves")!;
  const note = doc.querySelector<HTMLElement>("#r-scale-note")!;
  const quantities = [...doc.querySelectorAll<HTMLElement>(".r-qty")].map(el => ({ el, amount: {
    min: Number(el.dataset.min), ...(el.dataset.max ? { max: Number(el.dataset.max) } : {}), unit: (el.dataset.unit ?? "") as Unit } as Amount }));
  const renderAmounts = () => {
    const factor = serves / base;
    for (const { el, amount } of quantities) el.textContent = formatAmount(scaleAmount(amount, factor), units);
    output.value = String(serves);
    output.textContent = String(serves);
    note.hidden = serves === base;
    note.textContent = serves === base ? "" : `Scaled from ${base} to ${serves} servings. Cooking times stay about the same, but a fuller pot takes longer to come to the boil${serves > base ? ", and you may need a bigger one" : ""}.`;
    for (const button of doc.querySelectorAll<HTMLElement>("[data-units]")) button.setAttribute("aria-pressed", String(button.dataset.units === units));
    for (const button of doc.querySelectorAll<HTMLElement>("[data-bowls]")) button.setAttribute("aria-pressed", String(serves === base * Number(button.dataset.bowls)));
  };
  doc.querySelector<HTMLElement>("#r-scale")!.hidden = false;
  doc.addEventListener("click", e => {
    const target = e.target as Element;
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "fewer" || action === "more") {
      serves = Math.min(Math.max(serves + (action === "more" ? 1 : -1), 1), 24);
      renderAmounts();
      trackEvent("recipe_scaled", { factor: Math.round((serves / base) * 100) / 100 });
    }
    const unitButton = target.closest<HTMLElement>("[data-units]");
    if (unitButton) { units = unitButton.dataset.units as System; setPreferredUnits(units); renderAmounts(); }
    const bowls = target.closest<HTMLElement>("[data-bowls]");
    if (bowls) {
      serves = base * Number(bowls.dataset.bowls);
      renderAmounts();
      trackEvent("recipe_scaled", { factor: Number(bowls.dataset.bowls) });
    }
  });
  renderAmounts();

  // ── Ingredient checklist (this tab only) ──
  const checks = [...doc.querySelectorAll<HTMLInputElement>(".r-ing__check")];
  for (const i of checkedIngredients(slug)) if (checks[i]) checks[i]!.checked = true;
  doc.addEventListener("change", e => {
    if (!(e.target as Element).matches(".r-ing__check")) return;
    setCheckedIngredients(slug, checks.flatMap((c, i) => c.checked ? [i] : []));
  });

  // ── Steps: tap one (or its number) to tick it off ──
  const steps = [...doc.querySelectorAll<HTMLElement>(".r-step")];
  const done = new Set(checkedSteps(slug));
  const showStep = (step: HTMLElement) => {
    const n = Number(step.id.replace("step-", ""));
    step.classList.toggle("is-done", done.has(n));
    step.querySelector(".r-step__n")?.setAttribute("aria-pressed", String(done.has(n)));
  };
  for (const step of steps) {
    const number = step.querySelector<HTMLElement>(".r-step__n");
    if (!number) continue;
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "r-step__n";
    button.textContent = number.textContent;
    button.setAttribute("aria-label", `Step ${number.textContent}: done`);
    number.replaceWith(button);
    showStep(step);
  }
  const hint = doc.querySelector<HTMLElement>("#r-method-hint");
  if (hint) hint.hidden = false;
  doc.addEventListener("click", e => {
    const target = e.target as Element;
    const step = target.closest<HTMLElement>(".r-step");
    if (!step || step.closest("#r-cook")) return;
    // Timers, links and selected text keep their own meaning.
    if (target.closest("a, button.r-timer") || (!target.closest(".r-step__n") && String(doc.getSelection?.() ?? ""))) return;
    const n = Number(step.id.replace("step-", ""));
    if (done.has(n)) done.delete(n); else done.add(n);
    showStep(step);
    setCheckedSteps(slug, [...done].sort((a, b) => a - b));
  });

  // ── Swaps: tabs when there's JavaScript, stacked lists when there isn't ──
  setupTabs(doc);

  // ── Timers in the method ──
  const timers = new Timers(doc);
  const stepLabel = (el: Element) => { const step = el.closest(".r-step"); return step ? `Step ${step.id.replace("step-", "")}` : title; };
  for (const span of doc.querySelectorAll<HTMLElement>(".r-timer")) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "r-timer";
    button.dataset.seconds = span.dataset.seconds!;
    button.innerHTML = `${span.innerHTML}<span class="r-timer__icon" aria-hidden="true">◷</span>`;
    button.setAttribute("aria-label", `Start a ${span.textContent} timer`);
    span.replaceWith(button);
  }
  doc.addEventListener("click", e => {
    const button = (e.target as Element).closest<HTMLElement>("button.r-timer");
    if (!button) return;
    timers.start(Number(button.dataset.seconds), `${stepLabel(button)} · ${button.textContent!.replace("◷", "").trim()}`);
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission().catch(() => undefined);
  });

  // ── Actions: cook mode, save, print ──
  const cookMode = new CookMode(doc, timers, title, () => askForRating(doc, slug));
  const actions = doc.querySelector<HTMLElement>("#r-actions")!;
  actions.hidden = false;
  const save = actions.querySelector<HTMLElement>("[data-action=save]")!;
  const showSaved = () => { const on = savedRecipes().has(slug); save.setAttribute("aria-pressed", String(on)); save.textContent = on ? "Saved" : "Save"; };
  showSaved();
  const saveStatus=doc.createElement("p");
  saveStatus.setAttribute("role","status");
  actions.after(saveStatus);
  actions.addEventListener("click", async e => {
    const action = (e.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "save") {
      const on = !savedRecipes().has(slug);
      if (save.getAttribute("aria-busy")==="true") return;
      save.setAttribute("aria-busy","true");
      try {
        if (await setRecipeSaved(slug,on)) {
          showSaved();
          saveStatus.textContent=on?"Saved to your account.":"Removed from saved recipes.";
          trackEvent(on ? "recipe_saved" : "recipe_unsaved");
        }
      } catch { saveStatus.textContent="Your recipe could not be saved. Please retry; nothing was stored on this device."; }
      finally {save.removeAttribute("aria-busy");}
    }
    if (action === "print") window.print();
    if (action === "cook") void cookMode.open();
  });

  // ── Private notes ──
  const notes = doc.querySelector<HTMLElement>("#r-notes")!;
  const textarea = doc.querySelector<HTMLTextAreaElement>("#r-notes-text")!;
  notes.hidden = false;
  textarea.value = recipeNote(slug);
  const noteSave=doc.createElement("button");
  noteSave.type="button";noteSave.className="r-button";noteSave.textContent="Save note to my account";
  const noteStatus=doc.createElement("p");noteStatus.setAttribute("role","status");
  notes.append(noteSave,noteStatus);
  noteSave.addEventListener("click",async()=>{
    noteSave.disabled=true;
    try {if(await setRecipeNote(slug,textarea.value))noteStatus.textContent="Private note saved to your account.";}
    catch {noteStatus.textContent="Your note could not be saved. Keep this page open and try again.";}
    finally {noteSave.disabled=false;}
  });
  void loadRecipeStorage().then(()=>{
    showSaved();
    if(!textarea.value)textarea.value=recipeNote(slug);
  }).catch(()=>{saveStatus.textContent="Account saves are unavailable. Please retry before leaving.";});
}

/** One step at a time, big type, screen kept awake. Arrow keys or buttons move through steps. */
class CookMode {
  private index = 0;
  private lock: { release(): Promise<void> } | null = null;
  private readonly dialog: HTMLElement;
  private readonly steps: HTMLElement[];
  private returnFocus: HTMLElement | null = null;

  constructor(private readonly doc: Document, private readonly timers: Timers, private readonly title: string, private readonly onFinish: () => void = () => {}) {
    this.dialog = doc.querySelector<HTMLElement>("#r-cook")!;
    this.steps = [...doc.querySelectorAll<HTMLElement>(".r-step")];
    this.dialog.addEventListener("click", e => {
      const action = (e.target as Element).closest<HTMLElement>("[data-cook]")?.dataset.cook;
      if (action === "next") this.go(this.index + 1);
      if (action === "prev") this.go(this.index - 1);
      if (action === "close") this.close();
      if (action === "finish") { this.close(); this.onFinish(); }
    });
    doc.addEventListener("keydown", e => {
      if (this.dialog.hidden) return;
      if (e.key === "ArrowRight") this.go(this.index + 1);
      if (e.key === "ArrowLeft") this.go(this.index - 1);
      if (e.key === "Escape") this.close();
    });
    doc.addEventListener("visibilitychange", () => { if (!doc.hidden && !this.dialog.hidden) void this.wake(); });
  }

  async open(): Promise<void> {
    this.returnFocus = this.doc.activeElement as HTMLElement | null;
    this.dialog.hidden = false;
    this.doc.body.classList.add("is-cooking");
    this.go(this.index);
    await this.wake();
    trackEvent("recipe_cook_mode");
  }

  close(): void {
    this.dialog.hidden = true;
    this.doc.body.classList.remove("is-cooking");
    void this.lock?.release().catch(() => undefined);
    this.lock = null;
    this.returnFocus?.focus();
  }

  private async wake(): Promise<void> {
    try {
      const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (wakeLock) this.lock = await wakeLock.request("screen");
    } catch { /* not supported or not allowed: the mode still works */ }
  }

  private go(index: number): void {
    this.index = Math.min(Math.max(index, 0), this.steps.length - 1);
    const step = this.steps[this.index]!;
    const group = step.closest("ol")?.previousElementSibling?.matches("h3") ? step.closest("ol")!.previousElementSibling!.textContent : "";
    const ingredients = this.doc.querySelector(".r-ingredients")!.cloneNode(true) as HTMLElement;
    ingredients.querySelector(".r-section-head")?.replaceChildren(Object.assign(this.doc.createElement("h3"), { textContent: "Ingredients" }));
    ingredients.querySelector("#r-scale-note")?.remove();
    for (const el of ingredients.querySelectorAll("[id]")) el.removeAttribute("id");
    this.dialog.innerHTML = `<div class="r-cook__bar"><p class="j-eyebrow" id="r-cook-title">${esc(this.title)} · Step ${this.index + 1} of ${this.steps.length}</p>
        <button type="button" class="r-button" data-cook="close">Done cooking</button></div>
      <progress class="r-cook__progress" max="${this.steps.length}" value="${this.index + 1}">Step ${this.index + 1} of ${this.steps.length}</progress>
      <div class="r-cook__step">${group ? `<p class="j-eyebrow">${esc(group)}</p>` : ""}<p class="r-cook__text">${step.querySelector("p")!.innerHTML}</p></div>
      <div class="r-cook__nav"><button type="button" class="r-button" data-cook="prev"${this.index ? "" : " disabled"}>← Back</button>
        <button type="button" class="r-button r-button--solid" data-cook="${this.index < this.steps.length - 1 ? "next" : "finish"}">${this.index < this.steps.length - 1 ? "Next step →" : "Finish"}</button></div>
      <details class="r-cook__ings"><summary>Ingredients</summary>${ingredients.innerHTML}</details>`;
    this.dialog.querySelector<HTMLElement>("[data-cook=next], [data-cook=finish]")?.focus();
  }
}

/** Gluten-free / plant-based / high-protein swaps as an accessible tab set (arrow keys move between tabs). */
export function setupTabs(doc: Document): void {
  const tablist = doc.querySelector<HTMLElement>(".r-swaps__tabs");
  if (!tablist) return;
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>("[role=tab]")];
  const panels = tabs.map(tab => doc.getElementById(tab.getAttribute("aria-controls")!)!);
  tablist.hidden = false;
  panels.forEach((panel, i) => {
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tabs[i]!.id);
    panel.tabIndex = 0;
    panel.querySelector("h3")?.classList.add("r-sr");
  });
  const select = (index: number, focus = false) => {
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i]!.hidden = i !== index;
    });
    if (focus) tabs[index]!.focus();
  };
  select(0);
  tablist.addEventListener("click", e => {
    const index = tabs.indexOf((e.target as Element).closest<HTMLButtonElement>("[role=tab]")!);
    if (index >= 0) { select(index); trackEvent("recipe_swaps", { tab: tabs[index]!.textContent ?? "" }); }
  });
  tablist.addEventListener("keydown", e => {
    const current = tabs.findIndex(tab => tab.getAttribute("aria-selected") === "true");
    const next = e.key === "ArrowRight" ? current + 1 : e.key === "ArrowLeft" ? current - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    select((next + tabs.length) % tabs.length, true);
  });
}

const promptKey = (slug: string) => `soupmap:recipes:rate-prompt:${slug}`;

/** After cooking it through: a quiet invitation to rate, once per recipe per tab. */
export function askForRating(doc: Document, slug: string): void {
  try { if (sessionStorage.getItem(promptKey(slug))) return; sessionStorage.setItem(promptKey(slug), "1"); } catch { /* storage off: show it anyway */ }
  const actions = doc.querySelector<HTMLElement>("#r-actions");
  if (!actions || doc.querySelector(".r-made-it")) return;
  const prompt = doc.createElement("aside");
  prompt.className = "r-made-it";
  prompt.setAttribute("role", "status");
  prompt.innerHTML = `<p><strong>Made it?</strong> Rate it, or leave a tip for the next cook.</p>
    <a class="r-button r-button--solid" href="#reviews">Rate this recipe</a><button type="button" class="r-link" data-made-it="dismiss" aria-label="Dismiss">Not now</button>`;
  actions.after(prompt);
  prompt.addEventListener("click", e => {
    const target = e.target as Element;
    if (target.closest("[data-made-it=dismiss]")) prompt.remove();
    if (target.closest("a[href='#reviews']")) { trackEvent("recipe_rate_prompt"); prompt.remove(); }
  });
  trackEvent("recipe_cook_finished");
}
