/** Keep streamed city meshes out of the planet-scale opening. */
export function citySurfaceActive(height:number,previous:boolean):boolean {
  return previous ? height<450_000 : height<250_000;
}

export function renderBudget(lowPower:boolean) {
  const mib=1024*1024;
  return {
    cacheBytes:(lowPower ? 64 : 256)*mib,
    maximumCacheOverflowBytes:(lowPower ? 16 : 64)*mib,
    maximumScreenSpaceError:lowPower ? 32 : 16,
    preloadWhenHidden:false,
    preloadFlightDestinations:false,
  };
}

export function movingScreenSpaceError(lowPower: boolean, moving: boolean, height = Infinity): number {
  if (!lowPower) return renderBudget(false).maximumScreenSpaceError;
  if (moving) return 64;
  // Spend bandwidth on nearby buildings only after navigation has stopped.
  return height < 2_500 ? 12 : height < 20_000 ? 20 : 32;
}

/** CSS-pixel density, not the device's often very expensive full retina scale. */
export function renderPixelRatio(lowPower: boolean, moving: boolean, height: number, dpr: number): number {
  return Math.min(Math.max(dpr, 1), lowPower ? (!moving && height < 2_500 ? 1.5 : 1) : 2);
}
