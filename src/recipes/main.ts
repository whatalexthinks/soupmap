/** Entry for /recipes/: browsing on index and browse pages; cooking and reviews on recipe pages. */
import { loadRatings, ratingText, setupBrowse } from "./browse.ts";
import { setupRecipe } from "./cook.ts";
import { ReviewsSection, summaryLine } from "./reviews.ts";
import { loadRecipeStorage } from "./storage.ts";

const recipe = document.querySelector<HTMLElement>(".r-recipe");
// Related-recipe cards on a recipe page show ratings too.
const ratings = loadRatings();
void loadRecipeStorage().catch(()=>undefined).then(()=>setupBrowse(document, ratings));
void ratings.then(result => {
  if (!result) return;
  for (const slot of document.querySelectorAll<HTMLElement>("[data-rating-for]")) slot.textContent = ratingText(result[slot.dataset.ratingFor!]);
});

if (recipe) {
  setupRecipe(document);
  const section = document.querySelector<HTMLElement>("#reviews")!;
  const summary = document.querySelector<HTMLElement>("#r-rating-summary")!;
  const reviews = new ReviewsSection(section, recipe.dataset.recipe!, fetch, s => { summary.innerHTML = summaryLine(s); });
  // Load reviews when they're close to view, so the recipe itself is never waiting on them.
  let requested = false;
  const load = () => { if (!requested) { requested = true; void reviews.load(); } };
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    observer.disconnect();
    load();
  }, { rootMargin: "1200px 0px" });
  observer.observe(section);
  // The rating line under the title comes from the same request, so start it soon either way.
  setTimeout(load, 1500);
}
