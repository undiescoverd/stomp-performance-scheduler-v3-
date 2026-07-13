/**
 * Tests sendEmail's fallback contract: when the Resend provider can't deliver
 * — because it's unreachable, or because no ResendAPIKey is configured — it must
 * fall back to log delivery and never throw (a failed email must not fail the
 * auth request that triggered it).
 *
 * fetch is stubbed so this never makes a real network call. That matters now
 * that ResendAPIKey is configured for the dev/local secret types that
 * `encore test` runs under: without the stub, this test would hit the live
 * Resend API and send a real message on every run.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import { sendEmail } from './email';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendEmail', () => {
  test('falls back to log delivery when the provider is unreachable or unconfigured', async () => {
    // If a key IS configured, sendEmail calls Resend — force that call to fail so
    // the result is deterministic. If no key is configured, fetch is never called
    // and we reach the same log fallback. Either way: log delivery, no throw.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const result = await sendEmail({
      to: 'someone@example.com',
      subject: 'test',
      text: 'body',
    });

    expect(result).toEqual({ delivered: false, provider: 'log' });
  });

  test('falls back to log delivery (without throwing) when Resend rejects the request', async () => {
    // A configured key whose request Resend refuses (e.g. 401/400) must also
    // degrade to log delivery rather than surface an error. When no key is
    // configured this simply exercises the same fallback.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"message":"nope"}', { status: 401 }),
    );

    const result = await sendEmail({
      to: 'someone@example.com',
      subject: 'test',
      text: 'body',
    });

    expect(result).toEqual({ delivered: false, provider: 'log' });
  });
});
