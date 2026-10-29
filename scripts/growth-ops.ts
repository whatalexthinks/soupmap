/** Operator CLI: private queue, ownership review, approved promotions, mail retries and retention. */
import { readFileSync, writeFileSync } from 'node:fs';
import { GrowthStore } from '../server/growth-store.ts';
import { deliverLead } from '../server/growth-mail.ts';
import { shopBySlug } from '../src/data/shops.ts';
const store=new GrowthStore();
const [command,...args]=process.argv.slice(2);
const file=new URL('../src/data/commerce.json',import.meta.url);
const config=JSON.parse(readFileSync(file,'utf8'));
try {
  if(command==='queue') {
    console.log(JSON.stringify((await store.db.query("SELECT * FROM restaurant_claims WHERE status='pending' ORDER BY created_at LIMIT 100")).rows,null,2));
  } else if(command==='verify') {
    const [id,evidence]=args;
    if(!id||!evidence||!evidence.startsWith('https://'))throw new Error('Usage: verify <claim UUID> <ownership evidence URL>; verify representation before running.');
    const result=await store.db.query("UPDATE restaurant_claims SET status='verified',reviewed_at=now() WHERE id=$1 RETURNING shop_slug",[id]);
    const slug=result.rows[0]?.shop_slug;if(!slug||!shopBySlug.has(slug))throw new Error('Claim not found.');
    let listing=config.listings.find((v:{slug:string})=>v.slug===slug);
    if(!listing){listing={slug};config.listings.push(listing);}
    listing.verifiedOwner=true;listing.ownershipEvidence=evidence;
    writeFileSync(file,JSON.stringify(config,null,2)+'\n');
    console.log('Ownership approved in the publication manifest. Rebuild and deploy to publish.');
  } else if(command==='feature') {
    const [slug,until,orderUrl]=args;const listing=config.listings.find((v:{slug:string})=>v.slug===slug);
    if(!listing?.verifiedOwner||!until||!/^\d{4}-\d{2}-\d{2}T/.test(until)||!(Date.parse(until)>Date.now()))throw new Error('Usage: feature <verified slug> <future ISO expiry> [https order URL]');
    if(orderUrl&&new URL(orderUrl).protocol!=='https:')throw new Error('HTTPS order URL required.');
    listing.featuredUntil=until;if(orderUrl)listing.orderUrl=orderUrl;
    writeFileSync(file,JSON.stringify(config,null,2)+'\n');console.log('Sponsored placement prepared. Rebuild and deploy to publish.');
  } else if(command==='retry-mail') {
    if(!process.env.RESEND_API_KEY||!process.env.SOUPMAP_EMAIL_FROM)throw new Error('Configure the mail provider first.');
    await store.db.query("UPDATE growth_leads SET status='failed' WHERE status='sending' AND created_at>now()-interval '24 hours' AND delivery_started_at<now()-interval '15 minutes'");
    const rows=(await store.db.query("SELECT id FROM growth_leads WHERE status IN ('queued','failed') AND attempts<5 AND created_at>now()-interval '24 hours' ORDER BY created_at LIMIT 50")).rows;
    for(const row of rows)console.log(row.id,await deliverLead(store,row.id)?'sent':'pending');
  } else if(command==='retention') {
    await store.db.query("DELETE FROM growth_leads WHERE created_at<now()-interval '90 days'");
    await store.db.query("DELETE FROM restaurant_claims WHERE status!='verified' AND created_at<now()-interval '90 days'");
    console.log('Retention completed.');
  } else throw new Error('Commands: queue, verify, feature, retry-mail, retention');
}finally{await store.db.end();}
