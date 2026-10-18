// Fonts: Google Fonts (OFL), self-hosted via Fontsource. Only the subsets a page uses are downloaded.
import "@fontsource-variable/fraunces/soft.css";
import "@fontsource-variable/instrument-sans";
import "./styles/main.css";
import "./styles/atlas.css";
import "./styles/catalog.css";
import "./styles/streetview.css";
import "./styles/discovery-controls.css";
import "./styles/mobile-map.css";
import "./styles/shortlist-share.css";
import "./styles/history.css";
import { loadJapaneseFont } from "./fonts.ts";

loadJapaneseFont();
void import("./app.ts").then(({ App }) => new App().start()).catch(() => {
  const message = document.querySelector("#loader-text");
  if (message) message.textContent = "The shop catalog could not load. Reload the page to try again.";
  document.querySelector(".loader__steam")?.remove();
});
