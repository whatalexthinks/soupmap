import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export type PersonalList = { id: string; name: string; kind: "saved" | "custom"; ids: string[] };
export class ListStore {
  constructor(private readonly db = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })) {}

  async entries(owner: string, kind: string): Promise<{key:string;value:unknown}[]> {
    const result = await this.db.query(
      "SELECT entry_key AS key,value FROM personal_entries WHERE owner_id=$1 AND kind=$2 ORDER BY updated_at DESC", [owner,kind]);
    return result.rows;
  }
  async putEntry(owner: string, kind: string, key: string, value: unknown): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [owner]);
      const limit = kind === "trip" ? 30 : kind === "draft" ? 1 : 1000;
      const result = await client.query(`INSERT INTO personal_entries(owner_id,kind,entry_key,value)
        SELECT $1,$2,$3,$4::jsonb WHERE
          EXISTS(SELECT 1 FROM personal_entries WHERE owner_id=$1 AND kind=$2 AND entry_key=$3)
          OR (SELECT count(*) FROM personal_entries WHERE owner_id=$1 AND kind=$2) < $5
        ON CONFLICT(owner_id,kind,entry_key) DO UPDATE SET value=excluded.value,updated_at=now()
        RETURNING entry_key`, [owner,kind,key,JSON.stringify(value),limit]);
      if (!result.rowCount) throw new Error("Your account has reached the save limit for this collection.");
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async deleteEntry(owner: string, kind: string, key: string): Promise<void> {
    await this.db.query("DELETE FROM personal_entries WHERE owner_id=$1 AND kind=$2 AND entry_key=$3", [owner,kind,key]);
  }

  async savedList(owner: string): Promise<string> {
    await this.db.query(`INSERT INTO personal_lists(id,owner_id,name,kind)
      VALUES($1,$2,'Saved places','saved')
      ON CONFLICT(owner_id) WHERE kind='saved' DO NOTHING`, [randomUUID(), owner]);
    const result = await this.db.query("SELECT id FROM personal_lists WHERE owner_id=$1 AND kind='saved'", [owner]);
    return result.rows[0].id as string;
  }
  async all(owner: string): Promise<PersonalList[]> {
    await this.savedList(owner);
    const result = await this.db.query(`SELECT l.id,l.name,l.kind,
      COALESCE(array_agg(i.shop_slug ORDER BY i.added_at) FILTER(WHERE i.shop_slug IS NOT NULL),'{}') AS ids
      FROM personal_lists l LEFT JOIN personal_list_items i ON i.list_id=l.id
      WHERE l.owner_id=$1 GROUP BY l.id ORDER BY l.kind DESC,l.created_at`, [owner]);
    return result.rows;
  }
  async create(owner: string, name: string): Promise<PersonalList | null> {
    // Lock per owner to enforce the count limit across concurrent requests.
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [owner]);
      const result = await client.query(`INSERT INTO personal_lists(id,owner_id,name)
        SELECT $1,$2,$3 WHERE (SELECT count(*) FROM personal_lists WHERE owner_id=$2 AND kind='custom') < 30
        RETURNING id,name,kind`, [randomUUID(), owner, name]);
      await client.query("COMMIT");
      return result.rows[0] ? {...result.rows[0], ids: []} : null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async rename(owner: string, id: string, name: string): Promise<boolean> {
    const result = await this.db.query("UPDATE personal_lists SET name=$3,updated_at=now() WHERE id=$1 AND owner_id=$2 AND kind='custom'", [id, owner, name]);
    return result.rowCount === 1;
  }
  async remove(owner: string, id: string): Promise<boolean> {
    const result = await this.db.query("DELETE FROM personal_lists WHERE id=$1 AND owner_id=$2 AND kind='custom'", [id, owner]);
    return result.rowCount === 1;
  }
  async setItems(owner: string, id: string, slugs: string[], add: boolean): Promise<boolean> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const list = await client.query("SELECT id FROM personal_lists WHERE id=$1 AND owner_id=$2 FOR UPDATE", [id, owner]);
      if (!list.rowCount) { await client.query("ROLLBACK"); return false; }
      if (add) {
        const count = await client.query(`SELECT count(*)::int AS n FROM (
          SELECT shop_slug FROM personal_list_items WHERE list_id=$1 UNION SELECT unnest($2::text[])
        ) s`, [id, slugs]);
        if (count.rows[0].n > 1000) throw new Error("LIST_LIMIT");
        await client.query(`INSERT INTO personal_list_items(list_id,shop_slug)
          SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING`, [id, slugs]);
      } else {
        await client.query("DELETE FROM personal_list_items WHERE list_id=$1 AND shop_slug=ANY($2::text[])", [id, slugs]);
      }
      await client.query("UPDATE personal_lists SET updated_at=now() WHERE id=$1", [id]);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async close(): Promise<void> { await this.db.end(); }
}
