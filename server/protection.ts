import type { RequestHandler } from 'express';
import { getClerkProxyHost } from './middlewares/clerkProxyMiddleware.ts';
/** Bounded per-process protection; use a shared edge limiter when running multiple instances. */
export function apiProtection(now = Date.now): RequestHandler {
  const buckets=new Map<string,{count:number;expires:number}>();
  return (req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    if(/Bytespider|CCBot|Diffbot/i.test(req.get('user-agent')??'')){res.status(403).json({error:'Automated API access is unavailable.'});return;}
    const write=!['GET','HEAD','OPTIONS'].includes(req.method);
    const key=`${req.ip??req.socket.remoteAddress}:${write?'write':'read'}`;
    const current=now();let bucket=buckets.get(key);
    if(!bucket || bucket.expires<=current){
      if(buckets.size>=10000){for(const [key,value] of buckets)if(value.expires<=current)buckets.delete(key);}
      if(buckets.size>=10000){res.setHeader('Retry-After','60');res.status(429).json({error:'Please try again shortly.'});return;}
      bucket={count:0,expires:current+60000};buckets.set(key,bucket);
    }
    if(++bucket.count>(write?20:120)){res.setHeader('Retry-After',String(Math.max(1,Math.ceil((bucket.expires-current)/1000))));res.status(429).json({error:'Too many requests. Please try again shortly.'});return;}
    next();
  };
}
export const sameOriginJson:RequestHandler=(req,res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method)){next();return;}
  const origin=req.get('origin');let valid=true;
  try{valid=!origin || new URL(origin).host===getClerkProxyHost(req);}catch{valid=false;}
  if(!valid||req.get('sec-fetch-site')==='cross-site'){res.status(403).json({error:'Cross-site requests are not allowed.'});return;}
  if(!req.is('application/json')){res.status(415).json({error:'Use application/json.'});return;}
  next();
};
