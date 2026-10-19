/** Versioned, bounded URL payload. A shared link is a snapshot, not a synced collection. */
export const SHORTLIST_LIMIT = 20;
export const SHORTLIST_HASH_LIMIT = 6000;
const ID = /^[a-z0-9][a-z0-9-]{0,199}$/;
export interface SharedShortlist {
  ids: string[];
  missing: number;
  error: string | null;
}

export function parseShortlist(hash: string, valid: ReadonlySet<string>): SharedShortlist | null {
  if (!hash.startsWith('#shortlist=')) return null;
  const fail = (error: string): SharedShortlist => ({ ids: [], missing: 0, error });
  if (hash.length > SHORTLIST_HASH_LIMIT) return fail('This shared link is too large. Ask for a list of up to 20 shops.');
  const params = new URLSearchParams(hash.slice(1));
  if (params.getAll('shortlist').length !== 1 || params.get('shortlist') !== 'v1') return fail('This shared-list link is invalid or uses an unsupported version.');
  const ids = params.getAll('id');
  if (ids.length > SHORTLIST_LIMIT) return fail('This shared link has too many shops. The limit is 20.');
  if (!ids.length || ids.some(id => !ID.test(id))) return fail('This shared-list link contains invalid shop IDs.');
  const unique = [...new Set(ids)];
  return { ids: unique.filter(id => valid.has(id)), missing: unique.filter(id => !valid.has(id)).length, error: null };
}

export function shortlistHash(ids: readonly string[]): string {
  if (!ids.length || ids.length > SHORTLIST_LIMIT || ids.some(id => !ID.test(id))) {
    throw new Error('Choose between 1 and 20 valid shops to share.');
  }
  const params = new URLSearchParams({ shortlist: 'v1' });
  for (const id of new Set(ids)) params.append('id', id);
  const hash = `#${params}`;
  if (hash.length > SHORTLIST_HASH_LIMIT) throw new Error('This shared link is too large. Choose fewer shops.');
  return hash;
}
