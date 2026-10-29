import type { RequestHandler } from "express";

/**
 * Run an identity middleware, but never let it take public routes down: if it fails (no key,
 * misconfiguration, provider error), the request continues without an identity. Routes that
 * need one still refuse. `onError` hears about the first failure only.
 */
export function optionalAuth(middleware: RequestHandler, onError: (error: unknown) => void = () => {}): RequestHandler {
  let reported = false;
  return (req, res, next) => {
    let settled = false;
    const done = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (error && !reported) { reported = true; onError(error); }
      next();
    };
    try { void Promise.resolve(middleware(req, res, done)).catch(done); } catch (error) { done(error); }
  };
}
