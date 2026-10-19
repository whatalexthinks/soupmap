/** Replit injects the tracker on published sites; never install a second tracker. */
type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track(name: string, data?: AnalyticsData): void | Promise<unknown> };
  }
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;
  try {
    const result = window.umami?.track(name, data);
    // Tracking must not interrupt UI actions, even on a rejected network request.
    if (result && typeof result.catch === "function") void result.catch(() => undefined);
  } catch {
    // Analytics is optional, including when blocked or unavailable offline.
  }
}
