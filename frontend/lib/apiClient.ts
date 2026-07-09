/**
 * Authenticated API client wrapper around the generated Encore client.
 *
 * The generated client (../client) is instantiated once with a custom fetcher
 * that injects the JWT Bearer token from localStorage on every request. Reading
 * the token at request time (rather than construction time) keeps the client
 * current across login/logout without rebuilding it.
 *
 * Components import `backend` from here via the `~backend/client` alias
 * (configured in vite.config.ts / vitest.config.ts), so all scheduler requests
 * are automatically authenticated.
 */
import { Client, Local, Environment, PreviewEnv } from '../client';

const TOKEN_KEY = 'stomp_auth_token';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// Custom fetcher that injects the Authorization header from localStorage.
const authedFetch: typeof fetch = (input, init) => {
  const token = getToken();
  if (!token) {
    return fetch(input as RequestInfo | URL, init as RequestInit);
  }

  // Merge the Authorization header without clobbering existing headers.
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(input as RequestInfo | URL, {
    ...(init as RequestInit),
    headers,
  });
};

const target: string = import.meta.env.VITE_CLIENT_TARGET || Local;

export const backend = new Client(target, {
  fetcher: authedFetch,
  requestInit: { credentials: 'include' },
});

export default backend;
export { Client, Local, Environment, PreviewEnv };
