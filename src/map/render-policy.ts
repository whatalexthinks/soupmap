/** Keep streamed city meshes out of the planet-scale opening. */
export function citySurfaceActive(height:number,previous:boolean):boolean {
  return previous ? height<450_000 : height<250_000;
}

export function renderBudget(lowPower:boolean) {
  const mib=1024*1024;
  return {
    cacheBytes:(lowPower ? 96 : 256)*mib,
    maximumCacheOverflowBytes:(lowPower ? 32 : 64)*mib,
    maximumScreenSpaceError:lowPower ? 32 : 16,
    preloadWhenHidden:false,
    preloadFlightDestinations:false,
  };
}
