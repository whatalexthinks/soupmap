type SaveKind = "place" | "collection" | "trip" | "visit" | "recipe" | "note";

type PromptCopy = {
  title: string;
  description: string;
};

const copyByKind: Record<SaveKind, PromptCopy> = {
  place: {
    title: "Keep this place for later.",
    description: "Create a Soupmap account to save this shop to your personal list and pick it up on any device.",
  },
  collection: {
    title: "Keep your collection together.",
    description: "An account keeps your Soupmap collections close, so the places you gather are there when you need them.",
  },
  trip: {
    title: "Keep this trip within reach.",
    description: "Create an account to save your plan and return to its stops from any device.",
  },
  visit: {
    title: "Keep your bowl history.",
    description: "Save the bowls you have tried to your account, and your food memories stay with your Soupmap.",
  },
  recipe: {
    title: "Save this recipe for later.",
    description: "Create an account to keep recipes alongside the places and bowls you love.",
  },
  note: {
    title: "Keep this note with your finds.",
    description: "Save your Soupmap notes to an account and find them again wherever you sign in.",
  },
};

let activeDialog: HTMLDialogElement | null = null;
let returnFocus: HTMLElement | null = null;

function returnPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function makeLink(label: string, className: string, path: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = className;
  link.textContent = label;
  link.href = `${path}?redirect_url=${encodeURIComponent(returnPath())}`;
  return link;
}

function closePrompt(): void {
  if (activeDialog?.open) activeDialog.close();
}

function createDialog(): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.className = "save-prompt";
  dialog.setAttribute("aria-labelledby", "save-prompt-title");
  dialog.setAttribute("aria-describedby", "save-prompt-description");

  const inner = document.createElement("div");
  inner.className = "save-prompt__inner";

  const eyebrow = document.createElement("p");
  eyebrow.className = "save-prompt__eyebrow";
  const mark = document.createElement("span");
  mark.className = "save-prompt__mark";
  mark.setAttribute("aria-hidden", "true");
  eyebrow.append(mark, document.createTextNode("YOUR SOUPMAP"));

  const title = document.createElement("h2");
  title.className = "save-prompt__title";
  title.id = "save-prompt-title";

  const description = document.createElement("p");
  description.className = "save-prompt__copy";
  description.id = "save-prompt-description";

  const actions = document.createElement("div");
  actions.className = "save-prompt__actions";

  const signup = makeLink("Create my account with email", "save-prompt__signup", "/sign-up");
  const signin = makeLink("Already have an account? Sign in", "save-prompt__signin", "/sign-in");
  const dismiss = document.createElement("button");
  dismiss.className = "save-prompt__dismiss";
  dismiss.type = "button";
  dismiss.textContent = "Keep exploring";
  dismiss.addEventListener("click", closePrompt);

  actions.append(signup, signin, dismiss);
  const privacy = document.createElement("p");
  privacy.className="save-prompt__privacy";
  privacy.textContent="Your saves stay private. No marketing subscription.";
  inner.append(eyebrow, title, description, actions, privacy);
  dialog.append(inner);

  dialog.addEventListener("click", (event: MouseEvent) => {
    if (event.target === dialog) closePrompt();
  });
  dialog.addEventListener("close", () => {
    activeDialog = null;
    dialog.remove();
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  });
  dialog.addEventListener("cancel", () => {
    // Native Escape closes the dialog; the close event restores focus.
  });
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") event.stopPropagation();
  });

  document.body.append(dialog);
  return dialog;
}

/**
 * Ask a guest to create or sign into an account before saving Soupmap content.
 * Browsing stays open; this prompt never collects an email address itself.
 */
export function promptToSave(kind: SaveKind = "place"): void {
  // A page that replaced its document (or a test's fresh window) needs a new dialog.
  if (!activeDialog?.isConnected) activeDialog = createDialog();
  if (activeDialog.open) return;

  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const prompt = copyByKind[kind];
  const title = activeDialog.querySelector<HTMLHeadingElement>("#save-prompt-title");
  const description = activeDialog.querySelector<HTMLParagraphElement>("#save-prompt-description");
  if (!title || !description) return;
  title.textContent = prompt.title;
  description.textContent = prompt.description;

  const signup = activeDialog.querySelector<HTMLAnchorElement>(".save-prompt__signup");
  const signin = activeDialog.querySelector<HTMLAnchorElement>(".save-prompt__signin");
  const redirect = encodeURIComponent(returnPath());
  if (signup) signup.href = `/sign-up?redirect_url=${redirect}`;
  if (signin) signin.href = `/sign-in?redirect_url=${redirect}`;

  activeDialog.showModal();
  activeDialog.querySelector<HTMLAnchorElement>(".save-prompt__signup")?.focus({ preventScroll: true });
}
