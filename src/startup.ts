/**
 * Tokyo is the explicit test destination while worldwide discovery is developed.
 * Do not infer the visitor's location from this setting or request it on startup.
 */
export const STARTUP_CITY_SLUG = "tokyo";

export const OPENING_SESSION_KEY = "soupmap:opening-attempted";

/** Consume before allocating WebGL: a renderer interruption must not replay it. */
export function claimOpening(storage:()=>Pick<Storage,"getItem"|"setItem">=()=>window.sessionStorage):boolean {
  try {
    const session=storage();
    const attempted=session.getItem(OPENING_SESSION_KEY)==="1";
    session.setItem(OPENING_SESSION_KEY,"1");
    return !attempted;
  } catch {
    // If storage is blocked, prefer a stable city view to a replay loop.
    return false;
  }
}
