import { badgeDetails, badgeSvg } from '../src/growth/badge.ts';
import { displayName } from '../src/names.ts';
import { Router, type Request } from 'express';
import { getAuth } from '@clerk/express';
import { z } from 'zod';
import { shopBySlug } from '../src/data/shops.ts';
import { CITIES } from '../src/data/cities.ts';
import { GrowthStore } from './growth-store.ts';
import { WeatherService } from './weather.ts';
import { sameOriginJson } from './protection.ts';
import { deliverLead } from './growth-mail.ts';

const email=z.email().trim().max(254).transform(s=>s.toLowerCase());
const shop=z.string().max(160);
const lead=z.object({email,shop:shop.default(''),city:z.string().min(1).max(100),marketing:z.boolean().default(false),website:z.literal('').default('')}).strict();
const claim=z.object({shop,name:z.string().trim().min(2).max(100),role:z.string().trim().min(2).max(80),email,
  phone:z.string().trim().min(7).max(32).regex(/^\+?[\d ()-]+$/),badge:z.boolean(),featured:z.boolean(),consent:z.literal(true),website:z.literal('').default('')}).strict();
export function growthPublicApi(store:GrowthStore, weather = new WeatherService(), deliver = deliverLead) {
  const router=Router();router.use(sameOriginJson);
  router.get('/place/:slug', (req,res)=>{
    const place=shopBySlug.get(req.params.slug as string);
    if(!place){res.status(404).json({error:'Place not found.'});return;}
    res.setHeader('Cache-Control','public, max-age=300');
    res.json({name:displayName(place,'en'),badge:badgeDetails(place)});
  });
  router.get('/badge/:file', (req,res)=>{
    const file=req.params.file as string;
    const place=file.endsWith('.svg')?shopBySlug.get(file.slice(0,-4)):undefined;
    if(!place){res.status(404).end();return;}
    res.setHeader('Cache-Control','public, max-age=300, s-maxage=900');
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'");
    res.type('image/svg+xml').send(badgeSvg(place));
  });
  router.get('/weather',async(req,res)=>{
    const parsed=z.object({lat:z.coerce.number().finite().min(-90).max(90),lng:z.coerce.number().finite().min(-180).max(180)}).safeParse(req.query);
    if(!parsed.success){res.status(400).json({error:'Choose a valid location.'});return;}
    // No key, no weather: "nothing to show" (pages drop the widget), not an outage to retry.
    if(!weather.configured){res.setHeader('Cache-Control','public, max-age=3600');res.status(204).end();return;}
    try{const value=await weather.current(parsed.data.lat,parsed.data.lng);res.setHeader('Cache-Control','public, max-age=300, s-maxage=900');res.json(value);}
    catch{res.status(503).json({error:'Current weather is unavailable. Please try again later.'});}
  });
  router.post('/leads',async(req,res)=>{
    const parsed=lead.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:'Enter a valid email address.'});return;}
    const input=parsed.data;const place=shopBySlug.get(input.shop);
    if(input.shop&&!place || !place&&input.city!=='Japan'&&!CITIES.some(c=>c.name===input.city)){res.status(400).json({error:'Choose a place or city in the guide.'});return;}
    if(place)input.city=place.city;
    try{
      const result=await store.lead(input);
      const sent=result.status==='sent'||await deliver(store,result.id);
      res.status(202).json({status:sent?'sent':'queued',message:sent?'Your soup link is on its way.':'Your request is saved. Email delivery is pending; you can also copy this page’s link.'});
    }catch{res.status(503).json({error:'We could not save your request. Please try again.'});}
  });
  router.post('/claims',async(req,res)=>{
    const parsed=claim.safeParse(req.body);
    if(!parsed.success||!shopBySlug.has(parsed.data?.shop??'')){res.status(400).json({error:'Check the restaurant, contact fields, and consent.'});return;}
    try{await store.claim(parsed.data);res.status(202).json({status:'pending',message:'Your claim is in the review queue. Ownership and any award eligibility must be checked before a badge is issued.'});}
    catch{res.status(503).json({error:'Your claim could not be saved. Please retry.'});}
  });
  return router;
}
export function growthAccountApi(store:GrowthStore,userId:(req:Request)=>string|null=req=>getAuth(req).userId) {
  const router=Router();router.use(sameOriginJson);
  router.use((req,res,next)=>{const owner=userId(req);if(!owner){res.status(401).json({error:'Sign in to start your passport.'});return;}res.locals.owner=owner;next();});
  router.get('/',async(_req,res)=>{
    try{const visits=await store.visits(res.locals.owner);const cities:Record<string,number>={};
      for(const id of visits){const place=shopBySlug.get(id);if(place)cities[place.city]=(cities[place.city]??0)+1;}
      res.json({visits,cities});
    }catch{res.status(503).json({error:'Your passport is temporarily unavailable.'});}
  });
  router.put('/:slug',async(req,res)=>{
    const parsed=z.object({tried:z.boolean()}).strict().safeParse(req.body);
    const slug=req.params.slug as string;
    if(!parsed.success||!shopBySlug.has(slug)){res.status(400).json({error:'Choose a valid place.'});return;}
    try{await store.visit(res.locals.owner,slug,parsed.data.tried);res.json({ok:true});}
    catch{res.status(503).json({error:'Your stamp could not be saved. Please retry.'});}
  });return router;
}
