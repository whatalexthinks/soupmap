/**
 * Saving needs an account; nothing falls back to device storage. DOM tests use this stand-in
 * for the account API to exercise the real save paths: GET /api/me, PUT /api/saved/:slug and
 * /api/personal/:kind[/:key]. Signed out, every account request answers 401, as the server does.
 */
export interface FakeAccount {
  signedIn: boolean;
  saved: string[];
  entries: Record<string, Record<string, unknown>>;
  /** "METHOD /path" for every account request, in order. */
  requests: string[];
}

const realFetch = globalThis.fetch;
export function restoreFetch(): void { globalThis.fetch = realFetch; }

/** Let promise chains and timers queued by a click run to completion. */
export async function settle(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

export function fakeAccount(options: { signedIn?: boolean; saved?: string[]; other?: (url: URL) => Response } = {}): FakeAccount {
  const account: FakeAccount = { signedIn: options.signedIn ?? true, saved: [...(options.saved ?? [])], entries: {}, requests: [] };
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const url = new URL(String(input), "https://soupmap.example");
    const method = init.method ?? "GET";
    const accountPath = /^\/api\/(?:me|saved\/|personal\/)/.test(url.pathname);
    if (!accountPath) return options.other?.(url) ?? Response.json({ error: "Not found." }, { status: 404 });
    account.requests.push(`${method} ${url.pathname}`);
    if (!account.signedIn) return Response.json({ error: "Sign in to save." }, { status: 401 });
    const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (url.pathname === "/api/me") return Response.json({ lists: [{ id: "saved", name: "Saved places", kind: "saved", ids: [...account.saved] }] });
    const saved = url.pathname.match(/^\/api\/saved\/(.+)$/);
    if (saved && method === "PUT") {
      const slug = decodeURIComponent(saved[1]!);
      account.saved = body.saved ? [...new Set([...account.saved, slug])] : account.saved.filter(id => id !== slug);
      return Response.json({ ok: true });
    }
    const entry = url.pathname.match(/^\/api\/personal\/(\w+)(?:\/(.+))?$/);
    if (entry) {
      const bucket = account.entries[entry[1]!] ??= {};
      if (method === "GET") return Response.json({ entries: Object.entries(bucket).map(([key, value]) => ({ key, value })) });
      const key = decodeURIComponent(entry[2] ?? "");
      if (method === "PUT") { bucket[key] = body; return Response.json({ ok: true }); }
      if (method === "DELETE") { delete bucket[key]; return Response.json({ ok: true }); }
    }
    return Response.json({ error: "Not found." }, { status: 404 });
  }) as typeof fetch;
  return account;
}
