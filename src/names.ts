import type { Shop } from "./data/shops.ts";

export type NameLanguage = "en" | "ja";
const STORAGE_KEY = "soupmap:name-language:v1";
let language: NameLanguage = "en";
export const hasJapanese = (text: string): boolean => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);

/** Called by the app, not at import time, so prerendering stays deterministic. */
export function restoreNameLanguage(): void {
  try { language = localStorage.getItem(STORAGE_KEY) === "ja" ? "ja" : "en"; }
  catch { language = "en"; }
}
export function getNameLanguage(): NameLanguage { return language; }
export function setNameLanguage(next: NameLanguage): void {
  language = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Storage may be disabled. */ }
}
export function isRomanizedName(shop: Shop): boolean {
  return hasJapanese(shop.name) && !!shop.nameRomanized;
}
export function displayName(shop: Shop, selected: NameLanguage = language): string {
  if (selected === "ja") return shop.nameJa;
  return hasJapanese(shop.name) ? shop.nameRomanized || shop.name : shop.name;
}
