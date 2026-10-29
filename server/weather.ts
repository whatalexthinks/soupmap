export interface SoupWeather { temperatureC:number; precipitation:number; code:number; time:string; score:number }
export function soupScore(temperature: number, rain: number): number {
  return Math.round(Math.min(10,Math.max(1,8-(temperature-10)*.14+(rain>0?1.4:0)))*10)/10;
}
export class WeatherService {
  private cache = new Map<string,{expires:number;value:SoupWeather}>();
  private pending = new Map<string,Promise<SoupWeather>>();
  constructor(private fetcher: typeof fetch = fetch, private now = Date.now) {}
  /** Open-Meteo's free tier is non-commercial: production shows weather only with a commercial key. */
  get configured():boolean { return process.env.NODE_ENV!=='production'||!!process.env.OPEN_METEO_API_KEY; }
  async current(lat:number,lng:number):Promise<SoupWeather> {
    const key=`${lat.toFixed(1)},${lng.toFixed(1)}`;
    const cached=this.cache.get(key);
    if(cached && cached.expires>this.now()) return cached.value;
    if(this.pending.has(key))return this.pending.get(key)!;
    if(this.pending.size>=20)throw new Error('Weather busy');
    const task=this.load(key).finally(()=>this.pending.delete(key));
    this.pending.set(key,task);return task;
  }
  private async load(key:string):Promise<SoupWeather> {
    const apiKey=process.env.OPEN_METEO_API_KEY;
    if(!this.configured)throw new Error('Commercial weather key required');
    const [lat,lng]=key.split(',');
    const url=new URL(`https://${apiKey?'customer-api':'api'}.open-meteo.com/v1/forecast`);
    url.searchParams.set('latitude',lat!);url.searchParams.set('longitude',lng!);
    url.searchParams.set('current','temperature_2m,precipitation,weather_code');
    url.searchParams.set('timeformat','unixtime');
    if(apiKey)url.searchParams.set('apikey',apiKey);
    const response=await this.fetcher(url,{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('Weather unavailable');
    const current=(await response.json()).current;
    if(!current || ![current.temperature_2m,current.precipitation,current.weather_code,current.time].every(Number.isFinite))throw new Error('Invalid weather');
    if(Math.abs(this.now()-current.time*1000)>3*3600000)throw new Error('Stale weather');
    const value={temperatureC:current.temperature_2m,precipitation:current.precipitation,code:current.weather_code,
      time:new Date(current.time*1000).toISOString(),score:soupScore(current.temperature_2m,current.precipitation)};
    if(this.cache.size>=1000)this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key,{expires:this.now()+15*60000,value});return value;
  }
}
