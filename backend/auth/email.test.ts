/**
 * Tests the real sendEmail (no mocks): with ResendAPIKey unset — the default
 * in test environments — it must fall back to log delivery and never throw.
 */

import { describe, test, expect } from 'vitest';
import { sendEmail } from './email';

describe('sendEmail', () => {
  test('falls back to log delivery when no provider is configured', async () => {
    const result = await sendEmail({
      to: 'someone@example.com',
      subject: 'test',
      text: 'body',
    });

    expect(result).toEqual({ delivered: false, provider: 'log' });
  });
});
