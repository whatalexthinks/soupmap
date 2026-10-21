/**
 * Reviews and cooks' tips on a recipe page. Anyone can read; signing in lets you rate, review,
 * share a tip, mark others helpful and report problems. All text from readers is escaped.
 */
import { esc } from "../ui/dom.ts";
import { trackEvent } from "../analytics.ts";

export type TipKind = "swap" | "technique" | "make-ahead" | "serving" | "other";
export interface Review {
  id: string; name: string; rating: number | null; body: string; madeIt: boolean; tip: string; tipKind: TipKind | null;
  created: string; updated: string; status: "published" | "hidden"; helpful: number; mine: boolean; voted: boolean; reports?: number;
}
export interface Summary { average: number | null; count: number; stars: number[]; madeIt: number; tips: number }
export interface ReviewsResponse { summary: Summary; reviews: Review[]; viewer: { signedIn: boolean; moderator: boolean } }

export const TIP_LABELS: Record<TipKind, string> = {
  swap: "Swap", technique: "Technique", "make-ahead": "Make ahead", serving: "Serving", other: "Tip",
};
const REASONS: [string, string][] = [["spam", "Spam or advertising"], ["offensive", "Rude or offensive"], ["unsafe", "Unsafe advice"], ["off-topic", "Not about this recipe"], ["other", "Something else"]];
const SORTS: [string, string][] = [["helpful", "Most helpful"], ["recent", "Newest"], ["highest", "Highest rated"], ["lowest", "Lowest rated"]];

const date = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
export const stars = (rating: number) => `<span class="r-stars" role="img" aria-label="${rating} out of 5 stars">${"★".repeat(rating)}<span aria-hidden="true">${"★".repeat(5 - rating)}</span></span>`;
const paragraphs = (text: string) => text.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

async function call<T>(path: string, method = "GET", body?: unknown, fetcher: typeof fetch = fetch): Promise<T> {
  const response = await fetcher(`/api/recipes${path}`, {
    method, credentials: "same-origin", headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) throw Object.assign(new Error("Reviews aren't available here."), { status: 0 });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(data.error || "That didn't work. Please try again."), { status: response.status });
  return data;
}

export class ReviewsSection {
  private data: ReviewsResponse | null = null;
  private sort = "helpful";
  private notice = "";
  private editing = false;
  private busy = false;

  constructor(private readonly root: HTMLElement, private readonly slug: string, private readonly fetcher: typeof fetch = fetch,
    private readonly onSummary: (summary: Summary) => void = () => undefined) {
    root.addEventListener("click", e => void this.click(e));
    root.addEventListener("submit", e => void this.submit(e));
    root.addEventListener("change", e => {
      const target = e.target as HTMLSelectElement;
      if (target.name === "sort") { this.sort = target.value; void this.load(); }
    });
  }

  async load(): Promise<void> {
    try {
      this.data = await call<ReviewsResponse>(`/${this.slug}/reviews?sort=${this.sort}`, "GET", undefined, this.fetcher);
      this.onSummary(this.data.summary);
    } catch {
      this.data = null;
    }
    this.render();
  }

  private get mine(): Review | undefined { return this.data?.reviews.find(r => r.mine); }

  render(): void {
    const body = this.root.querySelector<HTMLElement>("#r-reviews-body")!;
    if (!this.data) {
      body.innerHTML = `<p class="r-muted">Reviews and tips aren't available right now. The recipe is all here.</p>`;
      return;
    }
    const { summary, reviews, viewer } = this.data;
    const tips = reviews.filter(r => r.tip && r.status === "published").sort((a, b) => b.helpful - a.helpful).slice(0, 8);
    const written = reviews.filter(r => r.body || r.rating);
    body.innerHTML = `${this.notice ? `<p class="r-notice" role="status" tabindex="-1">${esc(this.notice)}</p>` : ""}
      <div class="r-reviews__top">${this.summaryHtml(summary)}${this.formHtml(viewer.signedIn)}</div>
      ${tips.length ? `<section class="r-tips" aria-labelledby="tips-from-cooks"><h3 id="tips-from-cooks">Tips from cooks</h3>
        <ul>${tips.map(t => `<li class="r-tip"><span class="r-tip__kind">${esc(TIP_LABELS[t.tipKind ?? "other"])}</span>
          <p>${esc(t.tip)}</p><p class="r-muted">${esc(t.name)}${t.helpful ? ` · ${t.helpful} found this helpful` : ""}</p></li>`).join("")}</ul></section>` : ""}
      ${written.length ? `<section class="r-list" aria-labelledby="all-reviews">
        <div class="r-list__head"><h3 id="all-reviews">${written.length} ${written.length === 1 ? "review" : "reviews"}</h3>
          <label class="r-filter"><span class="j-eyebrow">Sort</span><select name="sort">${SORTS.map(([v, l]) => `<option value="${v}"${v === this.sort ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
        <ul>${written.map(r => this.reviewHtml(r, viewer)).join("")}</ul></section>` : ""}`;
    this.notice = "";
  }

  private summaryHtml(summary: Summary): string {
    if (!summary.count && !summary.tips) {
      return `<div class="r-summary r-summary--empty"><p class="r-summary__big">No reviews yet</p><p class="r-muted">Cooked it? Be the first to say how it went, or share the trick that made it work.</p></div>`;
    }
    const max = Math.max(1, ...summary.stars);
    return `<div class="r-summary">
      ${summary.average !== null ? `<p class="r-summary__big">${summary.average.toFixed(1)}</p>${stars(Math.round(summary.average))}
      <p class="r-muted">${summary.count} ${summary.count === 1 ? "rating" : "ratings"}${summary.madeIt ? ` · ${summary.madeIt} made it` : ""}</p>
      <ol class="r-bars" aria-label="Ratings by stars">${[5, 4, 3, 2, 1].map(n => `<li><span>${n}★</span><span class="r-bar"><span style="width:${Math.round(summary.stars[n - 1]! / max * 100)}%"></span></span><span>${summary.stars[n - 1]}</span></li>`).join("")}</ol>`
      : `<p class="r-muted">${summary.tips} ${summary.tips === 1 ? "tip" : "tips"} from cooks, no ratings yet.</p>`}
    </div>`;
  }

  private formHtml(signedIn: boolean): string {
    const here = encodeURIComponent(`${location.pathname}#reviews`);
    if (!signedIn) {
      return `<div class="r-write r-write--guest"><h3>Cooked this?</h3><p>Rate it, say how it went, or leave a tip for the next cook. You'll need a free account so reviews stay honest.</p>
        <div class="r-actions-row"><a class="r-button r-button--solid" href="/sign-in?redirect_url=${here}">Sign in to review</a><a class="r-button" href="/sign-up?redirect_url=${here}">Create an account</a></div></div>`;
    }
    const mine = this.mine;
    if (mine && !this.editing) {
      return `<div class="r-write"><h3>Your review</h3>${mine.status === "hidden" ? `<p class="r-notice">Hidden while a moderator takes a look. Only you can see it.</p>` : ""}
        <p>${mine.rating ? stars(mine.rating) : "No rating"}${mine.madeIt ? " · You made it" : ""}</p>
        <div class="r-actions-row"><button type="button" class="r-button" data-review="edit">Edit</button><button type="button" class="r-link" data-review="delete">Delete</button></div></div>`;
    }
    const v = mine ?? { name: "", rating: null, body: "", madeIt: false, tip: "", tipKind: null };
    return `<form class="r-write" data-form="review" novalidate>
      <h3>${mine ? "Edit your review" : "Leave a review or a tip"}</h3>
      <fieldset class="r-rate"><legend>Your rating <small>optional if you're only leaving a tip</small></legend>
        ${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="rating" value="${n}"${v.rating === n ? " checked" : ""} /><span aria-hidden="true">★</span><span class="r-sr">${n} ${n === 1 ? "star" : "stars"}</span></label>`).join("")}
      </fieldset>
      <label class="r-check"><input type="checkbox" name="madeIt"${v.madeIt ? " checked" : ""} /> I made this</label>
      <label class="r-field">How did it go? <small>optional</small><textarea name="body" rows="4" maxlength="2000" placeholder="What worked, what you'd change, who you made it for.">${esc(v.body)}</textarea></label>
      <div class="r-field-row">
        <label class="r-field">A tip for the next cook <small>optional</small><textarea name="tip" rows="2" maxlength="500" placeholder="e.g. Chicken feet give the broth a lovely body.">${esc(v.tip)}</textarea></label>
        <label class="r-field r-field--narrow">Kind of tip<select name="tipKind"><option value="">Choose…</option>${(Object.entries(TIP_LABELS) as [TipKind, string][]).map(([id, label]) => `<option value="${id}"${v.tipKind === id ? " selected" : ""}>${label}</option>`).join("")}</select></label>
      </div>
      <label class="r-field r-field--narrow">Name to show<input name="name" maxlength="40" autocomplete="nickname" placeholder="Home cook" value="${esc(v.name === "Home cook" ? "" : v.name)}" /></label>
      <p class="r-muted r-fine">Shown publicly with your review. No links, please. Be kind and specific; reviews that break this get hidden.</p>
      <div class="r-actions-row"><button class="r-button r-button--solid" type="submit">${mine ? "Save changes" : "Post"}</button>${mine ? `<button type="button" class="r-link" data-review="cancel">Cancel</button>` : ""}</div>
    </form>`;
  }

  private reviewHtml(r: Review, viewer: ReviewsResponse["viewer"]): string {
    const actions = [
      viewer.signedIn && !r.mine && r.status === "published" ? `<button type="button" class="r-link" data-review="helpful" data-id="${esc(r.id)}" aria-pressed="${r.voted}">${r.voted ? "Helpful ✓" : "Helpful"}${r.helpful ? ` (${r.helpful})` : ""}</button>` : r.helpful ? `<span class="r-muted">${r.helpful} found this helpful</span>` : "",
      viewer.signedIn && !r.mine ? `<details class="r-report"><summary>Report</summary><div>${REASONS.map(([v, l]) => `<button type="button" class="r-link" data-review="report" data-id="${esc(r.id)}" data-reason="${v}">${l}</button>`).join("")}</div></details>` : "",
      viewer.moderator ? `<button type="button" class="r-link" data-review="moderate" data-id="${esc(r.id)}" data-status="${r.status === "hidden" ? "published" : "hidden"}">${r.status === "hidden" ? "Restore" : "Hide"}</button>${r.reports ? `<span class="r-muted">${r.reports} reports</span>` : ""}` : "",
    ].filter(Boolean).join("");
    return `<li class="r-review${r.status === "hidden" ? " is-hidden" : ""}">
      <p class="r-review__head">${r.rating ? stars(r.rating) : ""}<strong>${esc(r.name)}</strong><span class="r-muted">${date(r.created)}${r.updated !== r.created ? " · edited" : ""}</span>${r.madeIt ? `<span class="r-badge">Made it</span>` : ""}${r.mine ? `<span class="r-badge">You</span>` : ""}</p>
      ${r.body ? paragraphs(r.body) : ""}
      ${r.tip ? `<p class="r-review__tip"><span class="r-tip__kind">${esc(TIP_LABELS[r.tipKind ?? "other"])}</span> ${esc(r.tip)}</p>` : ""}
      ${actions ? `<div class="r-review__actions">${actions}</div>` : ""}</li>`;
  }

  private async run(work: () => Promise<unknown>, message: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try { await work(); this.notice = message; }
    catch (error) {
      const status = (error as { status?: number }).status;
      this.notice = status === 401 ? "Your sign-in has expired. Please sign in again." : error instanceof Error ? error.message : "That didn't work.";
    } finally {
      this.busy = false;
      await this.load();
      this.root.querySelector<HTMLElement>(".r-notice")?.focus();
    }
  }

  private async submit(e: Event): Promise<void> {
    const form = e.target as HTMLFormElement;
    if (form.dataset.form !== "review") return;
    e.preventDefault();
    const data = new FormData(form);
    const rating = data.get("rating") ? Number(data.get("rating")) : null;
    const tip = String(data.get("tip") ?? "").trim();
    const tipKind = String(data.get("tipKind") ?? "") || null;
    if (!rating && !tip) { this.notice = "Add a star rating, a tip, or both."; this.render(); return; }
    if (tip && !tipKind) { this.notice = "Choose what kind of tip it is."; this.render(); return; }
    const editing = !!this.mine;
    await this.run(async () => {
      await call(`/${this.slug}/review`, "PUT", { rating, tip, tipKind: tip ? tipKind : null, body: String(data.get("body") ?? ""),
        madeIt: data.has("madeIt"), name: String(data.get("name") ?? "") }, this.fetcher);
      this.editing = false;
      trackEvent("recipe_review_posted", { rating: rating ?? 0, tip: !!tip, edit: editing });
    }, editing ? "Your review is updated." : "Thanks! Your review is up.");
  }

  private async click(e: Event): Promise<void> {
    const button = (e.target as Element).closest<HTMLElement>("[data-review]");
    if (!button) return;
    const { review: action, id, reason, status } = button.dataset;
    if (action === "edit") { this.editing = true; this.render(); this.root.querySelector<HTMLElement>("form[data-form=review] input, form[data-form=review] textarea")?.focus(); return; }
    if (action === "cancel") { this.editing = false; this.render(); return; }
    if (action === "delete") {
      if (!confirm("Delete your review and tip for this recipe?")) return;
      await this.run(() => call(`/${this.slug}/review`, "DELETE", {}, this.fetcher), "Your review is deleted.");
    }
    if (action === "helpful" && id) {
      await this.run(() => call(`/reviews/${id}/helpful`, "POST", { helpful: button.getAttribute("aria-pressed") !== "true" }, this.fetcher), "");
    }
    if (action === "report" && id && reason) {
      await this.run(() => call(`/reviews/${id}/report`, "POST", { reason }, this.fetcher), "Thanks for letting us know. A moderator will take a look.");
    }
    if (action === "moderate" && id && status) {
      await this.run(() => call(`/reviews/${id}/moderate`, "POST", { status }, this.fetcher), status === "hidden" ? "Hidden." : "Restored.");
    }
  }
}

/** "★ 4.6 · 12 ratings · 8 made it" under the title. */
export function summaryLine(summary: Summary): string {
  if (!summary.count) return summary.tips ? `<a href="#reviews">${summary.tips} ${summary.tips === 1 ? "tip" : "tips"} from cooks</a>` : `<a href="#reviews">Be the first to review</a>`;
  return `<a href="#reviews">${stars(Math.round(summary.average!))} <strong>${summary.average!.toFixed(1)}</strong> · ${summary.count} ${summary.count === 1 ? "rating" : "ratings"}${summary.madeIt ? ` · ${summary.madeIt} made it` : ""}</a>`;
}
