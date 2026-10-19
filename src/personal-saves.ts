export type PersonalList = {id:string; name:string; kind:"saved"|"custom"; ids:string[]};
let remote: ReadonlySet<string> | null = null;
let accountId: string | null = null;
let revision = 0;
const pending = new Set<string>();

export function accountSaved(): ReadonlySet<string> | null { return remote; }
export function setAccountSaved(owner: string | null, ids: readonly string[] = []): void {
  accountId = owner;
  revision++;
  remote = owner ? new Set(ids) : null;
  window.dispatchEvent(new Event("soupmap:account-saves"));
}
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method, credentials:"same-origin",
    headers: body === undefined ? {} : {"Content-Type":"application/json"},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  });
  const data = await response.json() as T & {error?:string};
  if (!response.ok) throw new Error(data.error || "This request could not be completed.");
  return data;
}
export async function changeAccountSaved(slug: string, saved: boolean): Promise<boolean> {
  if (!accountId || pending.has(slug)) return false;
  const current = revision;
  pending.add(slug);
  try {
    await api(`/saved/${encodeURIComponent(slug)}`, "PUT", {saved});
    if (current !== revision) return false;
    const next = new Set(remote);
    if (saved) next.add(slug); else next.delete(slug);
    remote = next;
    window.dispatchEvent(new Event("soupmap:account-saves"));
    return true;
  } finally { pending.delete(slug); }
}
