/// <reference types="google.maps" />
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

let configured = false;
let denied = false;
const pending = new Map<string, Promise<unknown>>();
function loadLibrary<T>(key: string, name: 'streetView' | 'places'): Promise<T> {
  if (denied) return Promise.reject(new Error('Google authorization failed'));
  const existing = pending.get(name);
  if (existing) return existing as Promise<T>;
  if (!configured) {
    configured = true;
    const host = window as Window & { gm_authFailure?: () => void };
    const previous = host.gm_authFailure;
    host.gm_authFailure = () => {
      denied = true;
      window.dispatchEvent(new Event('soupmap:google-auth-error'));
      previous?.();
    };
    setOptions({ key, v: 'weekly', language: 'en', region: 'JP', authReferrerPolicy: 'origin' });
  }
  const request = new Promise<T>((resolve, reject) => {
    const fail = () => { cleanup(); reject(new Error('Google authorization failed')); };
    window.addEventListener('soupmap:google-auth-error', fail, {once:true});
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Google Maps loading timed out')); }, 20000);
    const cleanup = () => { clearTimeout(timeout); window.removeEventListener('soupmap:google-auth-error', fail); };
    void importLibrary(name).then(value => { if(denied)fail();else resolve(value as T); }, reject).finally(cleanup);
  }).catch(error => { pending.delete(name); throw error; });
  pending.set(name, request);
  return request;
}
/** Shared bootstrap: requesting restaurant details never initializes Street View. */
export const loadPlaceLibrary = (key: string): Promise<google.maps.PlacesLibrary> => loadLibrary(key, 'places');
export const loadInteractiveStreetView = (key: string): Promise<google.maps.StreetViewLibrary> => loadLibrary(key, 'streetView');
