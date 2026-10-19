import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export type PersonalList = { id: string; name: string; kind: "saved" | "custom"; ids: string[] };
export class ListStore {
  constructor(private readonly db = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })) {}

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
