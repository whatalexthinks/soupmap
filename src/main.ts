// Base styles and Latin fonts are linked from HTML so they don't depend on JS startup.
import { loadJapaneseFont } from "./fonts.ts";

loadJapaneseFont();
void import("./app.ts").then(({ App }) => new App().start()).catch(() => {
  const message = document.querySelector("#loader-text");
  if (message) message.textContent = "The shop catalog could not load. Reload the page to try again.";
  document.querySelector(".loader__steam")?.remove();
});
