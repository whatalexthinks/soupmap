/**
 * The Markdown subset the journal guide allows, rendered to safe HTML.
 * Everything is escaped first; links accept only https:// and site paths.
 * Japanese runs are tagged lang="ja" so they get Japanese fonts and line breaking.
 */
import { esc } from "../ui/dom.ts";
import { LINK, normalizeHref } from "./content.ts";

const JAPANESE_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆「」『』（）、。・〜]+/gu;

export function tagJapanese(escaped: string): string {
  return escaped.replace(JAPANESE_RUN, run => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(run)
    ? `<span lang="ja">${run}</span>` : run);
}

function emphasis(text: string): string {
  return tagJapanese(esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, "$1<em>$2</em>"));
}

function link(label: string, raw: string): string {
  const href = normalizeHref(raw);
  if (/^https:\/\/[^\s"<>]+$/.test(href)) {
    return `<a href="${esc(href)}" target="_blank" rel="noopener">${emphasis(label)}</a>`;
  }
  if (/^\/[A-Za-z0-9/?=+%#._-]*$/.test(href)) return `<a href="${esc(href)}">${emphasis(label)}</a>`;
  return emphasis(label);
}

export function inline(text: string): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    out += emphasis(text.slice(last, match.index));
    out += link(match[1]!, match[2]!);
    last = match.index! + match[0].length;
  }
  return out + emphasis(text.slice(last));
}

export function headingId(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
}

type Block = { kind: "p" | "ul" | "ol" | "quote"; lines: string[] };

/** Group a blank-line-separated chunk into paragraphs, lists (with wrapped items) and quotes. */
function splitBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  for (const line of lines) {
    const bullet = /^[-*]\s+/.test(line), numbered = /^\d+\.\s+/.test(line), quote = line.startsWith(">");
    const kind: Block["kind"] = bullet ? "ul" : numbered ? "ol" : quote ? "quote" : "p";
    const current = blocks.at(-1);
    if (kind === "p" && current && (current.kind === "ul" || current.kind === "ol") && /^\s+/.test(line)) {
      current.lines[current.lines.length - 1] += ` ${line.trim()}`; // a wrapped list item
    } else if (current && current.kind === kind) {
      current.lines.push(line);
    } else {
      blocks.push({ kind, lines: [line] });
    }
  }
  return blocks;
}

/** Block structure: headings, lists, pull quotes and paragraphs, separated by blank lines. */
export function renderMarkdown(markdown: string): string {
  const html: string[] = [];
  const ids = new Set<string>();
  for (const chunk of markdown.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map(line => line.trimEnd()).filter(line => line.trim());
    while (lines.length) {
      const heading = lines[0]!.match(/^(#{2,3})\s+(.+)$/);
      if (heading) {
        lines.shift();
        const level = heading[1]!.length;
        let id = headingId(heading[2]!);
        for (let n = 2; ids.has(id); n++) id = `${headingId(heading[2]!)}-${n}`;
        ids.add(id);
        html.push(`<h${level} id="${id}">${inline(heading[2]!)}</h${level}>`);
        continue;
      }
      const end = lines.findIndex((line, i) => i > 0 && /^#{2,3}\s+/.test(line));
      const body = end < 0 ? lines.splice(0) : lines.splice(0, end);
      for (const block of splitBlocks(body)) {
        if (block.kind === "ul") html.push(`<ul>${block.lines.map(l => `<li>${inline(l.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`);
        else if (block.kind === "ol") html.push(`<ol>${block.lines.map(l => `<li>${inline(l.replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`);
        else if (block.kind === "quote") html.push(`<blockquote><p>${inline(block.lines.map(l => l.replace(/^>\s?/, "")).join(" "))}</p></blockquote>`);
        else html.push(`<p>${inline(block.lines.map(l => l.trim()).join(" "))}</p>`);
      }
    }
  }
  return html.join("\n");
}
