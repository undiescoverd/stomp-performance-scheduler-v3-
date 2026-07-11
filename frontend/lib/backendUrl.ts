/**
 * Derives the Encore backend origin from the frontend's own hostname.
 *
 * Encore Cloud serves this app's static frontend on a `<env->app.frontend.encr.app`
 * subdomain and the API on the sibling `<env->app.encr.app` domain. Build-time env
 * vars (VITE_API_URL / VITE_CLIENT_TARGET) can't reliably carry a per-environment
 * value here: `.env.production` is gitignored, so it isn't present when Encore
 * Cloud checks out the repo to build, and a single `vite build` (no --mode) serves
 * every environment. Deriving the backend origin from `window.location` at runtime
 * instead means the frontend finds the right backend for whichever environment
 * (production, staging, PR preview) actually served the page.
 */
export function deriveBackendUrlFromLocation(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const { protocol, hostname } = window.location;
  if (!hostname.includes('.frontend.')) return undefined;
  return `${protocol}//${hostname.replace('.frontend.', '.')}`;
}
