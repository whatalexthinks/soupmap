/**
 * Everything the dashboard knows about the visitor, from where it already lives:
 * legacy device data (read-only) and private account saves. New personal data is
 * persisted only to the account; old data is never silently imported.
 */
import { parseSaved, SAVED_KEY } from "../discovery.ts";
import { PASSPORT_KEY, localDate, parseVisits, type Visits } from "../passport.ts";
import { api, type PersonalList } from "../personal-saves.ts";
import { accountEntries, putAccountEntry, deleteAccountEntry } from "../personal-entries.ts";

export const TRIPS_KEY = "soupmap:trips:v1";
export const TRIP_LIMIT = 30;

export interface SavedTrip {
  id: string;
  name: string;
  area: string;
  areaLabel: string;
  created: string;
  days: { title: string; stops: string[] }[];
  /** Account list the trip was also saved to. */
  listId?: string;
}

export type AccountStatus = "guest" | "signed-in" | "unavailable";
export interface AccountState { status: AccountStatus; lists: PersonalList[] }

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function read(storage: Storage | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

export function parseTrips(raw: string | null, valid: ReadonlySet<string>): SavedTrip[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.flatMap((t): SavedTrip[] => {
      if (!t || typeof t !== "object") return [];
      const trip = t as Record<string, unknown>;
      if (typeof trip.id !== "string" || typeof trip.name !== "string" || typeof trip.area !== "string" || !Array.isArray(trip.days)) return [];
      const days = trip.days.flatMap((d): SavedTrip["days"] => {
        const day = d as { title?: unknown; stops?: unknown };
        if (!day || typeof day.title !== "string" || !Array.isArray(day.stops)) return [];
        const stops = day.stops.filter((s): s is string => typeof s === "string" && valid.has(s)).slice(0, 8);
        return stops.length ? [{ title: day.title.slice(0, 80), stops }] : [];
      }).slice(0, 7);
      if (!days.length) return [];
      return [{
        id: trip.id.slice(0, 40), name: trip.name.slice(0, 80), area: trip.area.slice(0, 60),
        areaLabel: typeof trip.areaLabel === "string" ? trip.areaLabel.slice(0, 60) : trip.area.slice(0, 60),
        created: typeof trip.created === "string" ? trip.created.slice(0, 10) : localDate(), days,
        ...(typeof trip.listId === "string" ? { listId: trip.listId.slice(0, 40) } : {}),
      }];
    }).slice(0, TRIP_LIMIT);
  } catch { return []; }
}

/** 200 → signed in; 401 → guest; anything else (no auth configured, offline) → unavailable. */
export async function loadAccount(fetcher: typeof fetch = fetch): Promise<AccountState> {
  try {
    const response = await fetcher("/api/me", { credentials: "same-origin", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (response.status === 401) return { status: "guest", lists: [] };
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return { status: "unavailable", lists: [] };
    const data = await response.json() as { lists?: PersonalList[] };
    return { status: "signed-in", lists: Array.isArray(data.lists) ? data.lists : [] };
  } catch {
    return { status: "unavailable", lists: [] };
  }
}

export class UserData {
  deviceSaved = new Set<string>();
  visits: Visits = {};
  trips: SavedTrip[] = [];
  account: AccountState = { status: "unavailable", lists: [] };
  /** False when browser storage refused a write (private mode, quota). */
  persistent = true;

  constructor(private readonly valid: ReadonlySet<string>, private readonly storage: Storage | null) {
    this.reload();
  }

  /** Re-read browser storage, e.g. after the map changed it in another tab. */
  reload(): void {
    this.deviceSaved = parseSaved(read(this.storage, SAVED_KEY), this.valid);
    if (!this.signedIn) {
      this.visits = parseVisits(read(this.storage, PASSPORT_KEY));
      this.trips = parseTrips(read(this.storage, TRIPS_KEY), this.valid);
    }
  }

  get signedIn(): boolean { return this.account.status === "signed-in"; }

  /** What "Saved" means right now: the account list when signed in, this device otherwise. */
  get saved(): ReadonlySet<string> {
    if (!this.signedIn) return this.deviceSaved;
    return new Set((this.account.lists.find(l => l.kind === "saved")?.ids ?? []).filter(id => this.valid.has(id)));
  }

  get customLists(): PersonalList[] { return this.account.lists.filter(l => l.kind === "custom"); }

  /** Device saves an account could import (only meaningful when signed in). */
  get importable(): string[] {
    if (!this.signedIn) return [];
    const saved = this.saved;
    return [...this.deviceSaved].filter(id => !saved.has(id));
  }

  async refreshAccount(fetcher?: typeof fetch): Promise<void> {
    const wasSignedIn=this.signedIn;
    const next = await loadAccount(fetcher);
    // A dropped connection shouldn't make a signed-in visitor look signed out.
    if (next.status !== "unavailable" || !this.signedIn) this.account = next;
    if(wasSignedIn && next.status==="guest"){this.visits={};this.trips=[];}
    if (this.signedIn && !fetcher) {
      const [visits,trips]=await Promise.all([
        accountEntries<Visits[string]>("visit"),accountEntries<SavedTrip>("trip"),
      ]);
      this.visits=visits;
      this.trips=parseTrips(JSON.stringify(Object.values(trips)),this.valid);
    }
  }

  async setSaved(slug: string, saved: boolean): Promise<void> {
    if (this.signedIn) {
      await api(`/saved/${encodeURIComponent(slug)}`, "PUT", { saved });
      const list = this.account.lists.find(l => l.kind === "saved");
      if (list) list.ids = saved ? [...new Set([...list.ids, slug])] : list.ids.filter(id => id !== slug);
      return;
    }
    throw new Error("Create an account or sign in to save your places.");
  }

  async importDeviceSaves(): Promise<number> {
    const ids = this.importable;
    if (!ids.length) return 0;
    await api("/import-saves", "POST", { ids, add: true });
    await this.refreshAccount();
    return ids.length;
  }

  /** A quick passport stamp from the dashboard; details can be added on the map later. */
  async markVisited(slug: string, date = localDate()): Promise<void> {
    if (!this.signedIn) throw new Error("Sign in to keep your passport.");
    const visit={ date, bowl: this.visits[slug]?.bowl ?? "", note: this.visits[slug]?.note ?? "", wouldReturn: this.visits[slug]?.wouldReturn ?? false };
    await putAccountEntry("visit",slug,visit);
    this.visits[slug]=visit;
  }

  async unmarkVisited(slug: string): Promise<void> {
    if (!this.signedIn) throw new Error("Sign in to update your passport.");
    await deleteAccountEntry("visit",slug);
    delete this.visits[slug];
  }

  async saveTrip(trip: Omit<SavedTrip, "id" | "created">): Promise<SavedTrip> {
    if (!this.signedIn) throw new Error("Sign in to keep this trip.");
    const saved: SavedTrip = { ...trip, id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, created: localDate() };
    await putAccountEntry("trip",saved.id,saved);
    this.trips = [saved, ...this.trips].slice(0, TRIP_LIMIT);
    return saved;
  }

  async deleteTrip(id: string): Promise<void> {
    if (!this.signedIn) throw new Error("Sign in to update your trips.");
    await deleteAccountEntry("trip",id);
    this.trips = this.trips.filter(t => t.id !== id);
  }

  /** Copy a trip into a new account list (every stop, in order). */
  async saveTripToAccount(trip: SavedTrip): Promise<void> {
    if (!this.signedIn) throw new Error("Sign in to keep this trip.");
    const { list } = await api<{ list: PersonalList }>("/lists", "POST", { name: trip.name.slice(0, 80) });
    await api(`/lists/${list.id}/items`, "PUT", { ids: trip.days.flatMap(d => d.stops), add: true });
    trip.listId = list.id;
    await putAccountEntry("trip",trip.id,trip);
    await this.refreshAccount();
  }

  /** Everything this device holds, as a downloadable backup. */
  exportJson(): string {
    return JSON.stringify({ format: "soupmap-export", version: 1, exported: new Date().toISOString(),
      saved: [...this.deviceSaved], passport: this.visits, trips: this.trips }, null, 2);
  }
}
