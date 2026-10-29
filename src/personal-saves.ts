import { promptToSave } from "./save-prompt.ts";
export type PersonalList = {id:string; name:string; kind:"saved"|"custom"; ids:string[]};
let remote: ReadonlySet<string> | null = null;
let accountId: string | null = null;
let revision = 0;
const pending = new Set<string>();

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Saving never falls back to browser storage, including while auth is loading. */
export async function requireSaveAccount(kind: Parameters<typeof promptToSave>[0] = "place"): Promise<boolean> {
  try {
    const data = await api<{lists:PersonalList[]}>("/me");
    // The server is the authority; do not mistake a loading Clerk widget for a guest.
    if (!accountId) setAccountSaved("current-session", data.lists.find(l => l.kind === "saved")?.ids ?? []);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setAccountSaved(null);
      promptToSave(kind);
      return false;
    }
    throw error;
  }
}

export function accountSaved(): ReadonlySet<string> | null { return remote; }
export function setAccountSaved(owner: string | null, ids: readonly string[] = []): void {
  // Signed out and staying signed out: nothing changed, so nothing should re-render.
  if (!owner && !accountId && !remote) return;
  accountId = owner;
  revision++;
  remote = owner ? new Set(ids) : null;
  window.dispatchEvent(new window.Event("soupmap:account-saves"));
}
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method, credentials:"same-origin",
    headers: body === undefined ? {} : {"Content-Type":"application/json"},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  });
  const data = await response.json() as T & {error?:string};
  if (!response.ok) throw new ApiError(data.error || "This request could not be completed.", response.status);
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
    window.dispatchEvent(new window.Event("soupmap:account-saves"));
    return true;
  } catch(error) {
    if (error instanceof ApiError && error.status===401) {
      setAccountSaved(null);promptToSave("place");return false;
    }
    throw error;
  } finally { pending.delete(slug); }
}
