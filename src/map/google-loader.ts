/// <reference types="google.maps" />
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let pending: Promise<google.maps.StreetViewLibrary> | undefined;
let denied = false;

/** Load only on explicit Street View entry, never on every shop selection. */
export function loadInteractiveStreetView(key: string): Promise<google.maps.StreetViewLibrary> {
  if (denied) return Promise.reject(new Error("Google authorization failed"));
  if (pending) return pending;
  pending = new Promise<google.maps.StreetViewLibrary>((resolve, reject) => {
    const host = window as Window & { gm_authFailure?: () => void };
    const previous = host.gm_authFailure;
    host.gm_authFailure = () => {
      denied = true;
      reject(new Error("Google authorization failed"));
      window.dispatchEvent(new Event("soupmap:google-auth-error"));
      previous?.();
    };
    const timeout = setTimeout(() => reject(new Error("Google Maps loading timed out")), 20000);
    setOptions({ key, v: "weekly", language: "en", region: "JP", authReferrerPolicy: "origin" });
    void importLibrary("streetView").then(resolve, reject).finally(() => clearTimeout(timeout));
  }).catch(error => {
    pending = undefined;
    throw error;
  });
  return pending;
}
