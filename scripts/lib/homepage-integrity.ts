import { Window } from "happy-dom";

/** Reject competing homepage branches even if their Git markers were removed. */
export async function assertHomepageStructure(html: string): Promise<void> {
  const window = new Window();
  try {
    window.document.write(html);
    const document = window.document;
    for (const selector of ["h1", "main", ".home-page > header", ".home-page > footer"]) {
      const count = document.querySelectorAll(selector).length;
      if (count !== 1) throw new Error(`Homepage must contain exactly one ${selector}; found ${count}.`);
    }
    const seen = new Set<string>();
    for (const element of document.querySelectorAll("[id]")) {
      if (seen.has(element.id)) throw new Error(`Duplicate homepage ID: ${element.id}`);
      seen.add(element.id);
    }
  } finally {
    await window.happyDOM.close();
  }
}
