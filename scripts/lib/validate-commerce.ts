import { z } from 'zod';
import config from '../../src/data/commerce.json' with {type:'json'};
import { shopBySlug } from '../../src/data/shops.ts';
const url=z.url({protocol:/^https:$/}).refine(s=>{const u=new URL(s);return !u.username&&!u.password;});
const date=z.iso.datetime({offset:true});
const Listing=z.object({slug:z.string(),verifiedOwner:z.boolean().optional(),ownershipEvidence:url.optional(),featuredUntil:date.optional(),
  orderUrl:url.optional(),reserveUrl:url.optional(),
  rating:z.object({value:z.number().min(1).max(5),count:z.number().int().positive(),source:url,checkedAt:z.iso.date()} ).optional(),
  award:z.object({label:z.string().min(5).max(34),evidenceUrl:url,expires:date}).optional(),
}).strict().refine(v=>!v.featuredUntil||v.verifiedOwner===true,'Featured listings require owner verification');
export function validateCommerce(value:unknown=config):void {
  const data=z.object({listings:z.array(Listing),affiliates:z.array(z.object({title:z.string().min(1).max(100),description:z.string().min(1).max(200),url,cuisines:z.array(z.enum(['ramen','udon','soba','oden','other']))}).strict())}).strict().parse(value);
  const ids=new Set<string>();
  for(const listing of data.listings){if(!shopBySlug.has(listing.slug)||ids.has(listing.slug))throw new Error(`Invalid or duplicate commerce slug: ${listing.slug}`);ids.add(listing.slug);}
}
