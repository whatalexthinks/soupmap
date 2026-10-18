// Fonts: Google Fonts (OFL), self-hosted via Fontsource. Only the subsets a page uses are downloaded.
import "@fontsource-variable/fraunces/soft.css";
import "@fontsource-variable/instrument-sans";
import "./styles/main.css";
import "./styles/atlas.css";
import "./styles/journey.css";
import { App } from "./app.ts";
import { loadJapaneseFont } from "./fonts.ts";

new App().start();
loadJapaneseFont();
