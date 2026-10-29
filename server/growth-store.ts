import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
export interface LeadInput { email: string; shop: string; city: string; marketing: boolean }
export interface ClaimInput { shop: string; name: string; role: string; email: string; phone: string; badge: boolean; featured: boolean }
export class GrowthStore {
  constructor(readonly db = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 3000 })) {}
  async lead(input: LeadInput): Promise<{id:string;status:string}> {
    const result = await this.db.query(`INSERT INTO growth_leads(id,email,shop_slug,city,marketing) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(email,shop_slug,city,requested_day) DO UPDATE SET marketing=growth_leads.marketing OR EXCLUDED.marketing RETURNING id,status`,
      [randomUUID(),input.email,input.shop,input.city,input.marketing]);
    return result.rows[0];
  }
  async claim(input: ClaimInput): Promise<void> {
    await this.db.query(`INSERT INTO restaurant_claims(id,shop_slug,contact_name,role,email,phone,wants_badge,wants_featured)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(shop_slug,email) DO UPDATE SET
      contact_name=EXCLUDED.contact_name,role=EXCLUDED.role,phone=EXCLUDED.phone,
      wants_badge=EXCLUDED.wants_badge,wants_featured=EXCLUDED.wants_featured`,
      [randomUUID(),input.shop,input.name,input.role,input.email,input.phone,input.badge,input.featured]);
  }
  async visits(owner: string): Promise<string[]> {
    const result = await this.db.query('SELECT shop_slug FROM account_passport WHERE owner_id=$1 ORDER BY visited_at DESC',[owner]);
    return result.rows.map(r=>r.shop_slug);
  }
  async visit(owner: string, shop: string, tried: boolean): Promise<void> {
    if (tried) await this.db.query('INSERT INTO account_passport(owner_id,shop_slug) VALUES($1,$2) ON CONFLICT DO NOTHING',[owner,shop]);
    else await this.db.query('DELETE FROM account_passport WHERE owner_id=$1 AND shop_slug=$2',[owner,shop]);
  }
}
