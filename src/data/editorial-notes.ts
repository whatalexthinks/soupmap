/** Source research is not an on-the-ground visit. Never set Shop.verified from this. */
export interface EditorialNote {
  checked: string;
  summary: string;
  practical: string;
  sources: { label: string; url: string }[];
  guides: { label: string; slug: string }[];
  warning?: string;
}

export const EDITORIAL_NOTES: Readonly<Record<string, EditorialNote>> = {
  "afuri-ebisu": {
    checked: "2026-10-27",
    summary: "AFURI’s own menu describes its yuzu shio ramen as chicken-and-dashi broth with yuzu. Shio refers to the seasoning, not a meat-free stock; the listed toppings include pork chashu and egg.",
    practical: "Use the Ebisu entry on AFURI’s branch directory to check the destination. The brand menu also describes other bowls, but branch availability and dietary suitability need confirming directly.",
    sources: [{ label: "AFURI menu", url: "https://afuri.com/menu/" }, { label: "AFURI branch directory — Ebisu", url: "https://afuri.com/shop/" }],
    guides: [{ label: "Plan your first Tokyo soup stop", slug: "tokyo-soup-guide" }, { label: "Dietary questions to ask before ordering", slug: "tokyo-ramen-dietary-questions" }],
  },
  "rokurinsha-tokyo-station": {
    checked: "2026-10-27",
    summary: "Tokyo Station First Avenue’s official Ramen Street guide lists Rokurinsha as a dipping-ramen shop and features its Tokusei Tsukemen. Noodles and dipping soup are served separately; it is not the same format as a bowl of soup ramen.",
    practical: "Follow signs for Tokyo Station First Avenue and Tokyo Ramen Street on the Yaesu side. Check the operator’s floor guide rather than relying on a surface-level map pin to find this underground branch. Leave a queue and navigation buffer before a train.",
    sources: [{ label: "Tokyo Ramen Street — official English guide", url: "https://www.tokyoeki-1bangai.co.jp/street/ramen/en/" }],
    guides: [{ label: "A flexible Tokyo soup day", slug: "tokyo-soup-day-plan" }, { label: "Tokyo Ramen Street", slug: "tokyo-ramen-street" }, { label: "How tsukemen works", slug: "tsukemen" }],
  },
  "sumire-susukino": {
    checked: "2026-10-27",
    summary: "Sumire’s official branch directory distinguishes its Susukino restaurant from the Nakanoshima main shop and other branches. The Susukino listing places it on the second floor of the Pyxis building at Minami 3-jo Nishi 3-chome 9-2.",
    practical: "Check the building and floor as well as the street location. The official directory warns that business hours may change; this page does not promise same-day availability.",
    sources: [{ label: "Sumire official branch directory", url: "http://www.sumireya.com/main/mainshop" }],
    guides: [{ label: "Sapporo miso ramen", slug: "sapporo-miso-ramen" }],
  },
  "honke-owariya": {
    checked: "2026-10-27",
    warning: "Restaurant service suspended: the operator says its main location entered an extended suspension on January 11, 2026. Do not plan a meal here without checking for an official reopening announcement.",
    summary: "Honke Owariya’s official notice, published October 2, 2026, says restaurant service at the main location has been suspended for an extended period. It also announces the end of sweets production and sales.",
    practical: "Retained as a historical catalog entry, not a current dining recommendation. The operator says future updates will appear on its website; no reopening date is asserted here.",
    sources: [{ label: "Honke Owariya — operator’s service-suspension notice", url: "https://honke-owariya.co.jp/" }],
    guides: [{ label: "Understanding soba", slug: "soba-guide" }],
  },
  "dotonbori-imai": {
    checked: "2026-10-27",
    summary: "Imai’s own kitsune udon description pairs udon with sweetened fried tofu and dashi made with kombu, mackerel flakes and urume fish flakes. A tofu topping does not make this fish-based dish vegetarian.",
    practical: "The operator lists several locations, including shops and take-away outlets. Choose the Honten entry when planning a sit-down visit to the Dotonbori main restaurant, and confirm the current branch menu.",
    sources: [{ label: "Imai — kitsune udon ingredients", url: "https://www.d-imai.com/menu/kitsune-udon/" }, { label: "Imai branch directory", url: "https://www.d-imai.com/shops" }],
    guides: [{ label: "What dashi contributes to soup", slug: "dashi" }],
  },
  "ippudo-daimyo": {
    checked: "2026-10-27",
    summary: "Fukuoka Prefecture’s official travel guide identifies the Daimyo store at 1-13-14 Daimyo, Chuo-ku, Fukuoka. It lists picture-based and English-language menu support, with a warning that facility information can change.",
    practical: "Use the Daimyo branch name when checking directions, rather than searching only for the chain. Reconfirm ordering assistance and the current menu with the operator; a tourism listing is not a guarantee of a particular dish or dietary accommodation.",
    sources: [{ label: "VISIT FUKUOKA — Hakata Ippudo Daimyo Store", url: "https://www.crossroadfukuoka.jp/en/inbound-shop/15167" }],
    guides: [{ label: "Hakata tonkotsu ramen", slug: "hakata-tonkotsu" }],
  },
  "ichiran-nakasu": {
    checked: "2026-10-27",
    summary: "Fukuoka Prefecture’s official travel guide identifies ICHIRAN’s headshop at 5-3-2 Nakasu, Hakata-ku. It describes the restaurant as a tonkotsu specialist and lists picture-based and English-language menus.",
    practical: "Match the headshop name and address before setting out: other ICHIRAN branches are separate destinations. Tonkotsu means pork-bone broth; do not treat a change of toppings as a meat-free substitution.",
    sources: [{ label: "VISIT FUKUOKA — ICHIRAN headshop", url: "https://www.crossroadfukuoka.jp/en/inbound-shop/15138" }],
    guides: [{ label: "Hakata tonkotsu ramen", slug: "hakata-tonkotsu" }],
  },
  "ide-shoten": {
    checked: "2026-10-27",
    summary: "ANA’s Wakayama food guide names Ide Shoten in its account of the city’s ramen tradition, noting that Marutaya’s owner trained there. The guide describes the region’s pork-broth-and-soy-sauce chuka soba, rather than providing a current Ide Shoten branch menu.",
    practical: "This source supports regional context, not today’s opening hours, queue or menu. Do not transfer the guide’s address for Arochi Marutaka, or its descriptions of other restaurants, to Ide Shoten.",
    sources: [{ label: "ANA Japan Travel Planner — Wakayama ramen", url: "https://www.ana.co.jp/en/us/japan-travel-planner/wakayama/0000009.html" }],
    guides: [{ label: "Wakayama ramen", slug: "wakayama-ramen" }],
  },
};

export const TOKYO_GUIDES = [
  { slug: "tokyo-soup-guide", label: "Tokyo soup guide: choose your first bowl" },
  { slug: "tokyo-soup-day-plan", label: "A flexible Tokyo soup day: station, streets and a backup" },
  { slug: "tokyo-ramen-dietary-questions", label: "Dietary questions to ask at Tokyo ramen shops" },
] as const;
