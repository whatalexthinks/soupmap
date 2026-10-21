import { api } from "./personal-saves.ts";
export type EntryKind = "visit" | "trip" | "recipe" | "draft";
export async function accountEntries<T>(kind: EntryKind): Promise<Record<string,T>> {
  const {entries}=await api<{entries:{key:string;value:T}[]}>(`/personal/${kind}`);
  return Object.fromEntries(entries.map(entry=>[entry.key,entry.value]));
}
export async function putAccountEntry(kind: EntryKind, key: string, value: unknown): Promise<void> {
  await api(`/personal/${kind}/${encodeURIComponent(key)}`,"PUT",value);
}
export async function deleteAccountEntry(kind: EntryKind, key: string): Promise<void> {
  await api(`/personal/${kind}/${encodeURIComponent(key)}`,"DELETE",{});
}
