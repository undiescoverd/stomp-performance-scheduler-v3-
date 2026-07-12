/**
 * Tests for Google Sign-In (/auth/google)
 *
 * The real Google ID-token verification can't run in CI (it needs a live
 * Google-signed token), so we mock google-auth-library's verifyIdToken to return
 * controlled payloads and assert the find-or-create/auto-link branching and the
 * resulting database state. Run with `encore test` so the scheduler DB + migrations
 * (including 10_add_oauth_columns) are provisioned.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { APIError } from 'encore.dev/api';

// Hoisted so the mock factory (which is hoisted above imports) can reference it.
const { mockVerifyIdToken } = vi.hoisted(() => ({ mockVerifyIdToken: vi.fn() }));

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

import { googleAuth, login } from './auth';
import { scheduleDB } from '../scheduler/db';

// Make verifyIdToken resolve to a ticket exposing the given Google payload.
function mockGooglePayload(payload: Record<string, unknown>) {
  mockVerifyIdToken.mockResolvedValue({ getPayload: () => payload });
}

async function countUsersByEmail(email: string): Promise<number> {
  const row = await scheduleDB.queryRow`SELECT COUNT(*)::int AS n FROM users WHERE email = ${email}`;
  return row?.n ?? 0;
}

async function getUserByEmail(email: string) {
  return scheduleDB.queryRow`
    SELECT id, email, password_hash, provider, provider_user_id, avatar_url, is_active
    FROM users WHERE email = ${email}
  `;
}

describe('POST /auth/google', () => {
  beforeEach(async () => {
    mockVerifyIdToken.mockReset();
    // Clean slate: sessions reference users (ON DELETE CASCADE) — clear both.
    await scheduleDB.exec`DELETE FROM user_sessions`;
    await scheduleDB.exec`DELETE FROM users`;
  });

  test('new Google user creates a provider=google, password-less account', async () => {
    mockGooglePayload({
      sub: 'google-sub-new',
      email: 'New.User@Gmail.com',
      email_verified: true,
      given_name: 'New',
      family_name: 'User',
      picture: 'https://example.com/a.png',
    });

    const res = await googleAuth({ credential: 'fake-id-token' });

    expect(res.token).toBeTruthy();
    expect(res.user.email).toBe('new.user@gmail.com'); // lowercased/trimmed

    const row = await getUserByEmail('new.user@gmail.com');
    expect(row).toBeTruthy();
    expect(row!.provider).toBe('google');
    expect(row!.provider_user_id).toBe('google-sub-new');
    expect(row!.password_hash).toBeNull();
    expect(row!.avatar_url).toBe('https://example.com/a.png');
    expect(res.user.id).toBe(row!.id);

    // An active session row must exist so the authHandler accepts the token.
    const session = await scheduleDB.queryRow`
      SELECT is_active FROM user_sessions WHERE user_id = ${row!.id} AND is_active = true
    `;
    expect(session).toBeTruthy();
  });

  test('existing password account is auto-linked by verified email (no duplicate, same id)', async () => {
    // Pre-existing password account.
    await scheduleDB.exec`
      INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
      VALUES ('existing-1', 'linkme@gmail.com', 'somehash', 'Link', 'Me', true, NOW(), NOW())
    `;

    mockGooglePayload({
      sub: 'google-sub-link',
      email: 'linkme@gmail.com',
      email_verified: true,
      given_name: 'Link',
      family_name: 'Me',
      picture: 'https://example.com/link.png',
    });

    const res = await googleAuth({ credential: 'fake-id-token' });

    expect(res.user.id).toBe('existing-1'); // same account, not a new one
    expect(await countUsersByEmail('linkme@gmail.com')).toBe(1); // no duplicate

    const row = await getUserByEmail('linkme@gmail.com');
    expect(row!.provider).toBe('google');
    expect(row!.provider_user_id).toBe('google-sub-link');
    expect(row!.password_hash).toBe('somehash'); // password preserved
    expect(row!.avatar_url).toBe('https://example.com/link.png');
  });

  test('existing Google identity matches by sub even when email changed', async () => {
    // Existing Google user whose Google email has since changed.
    await scheduleDB.exec`
      INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, provider, provider_user_id, created_at, updated_at)
      VALUES ('existing-2', 'old-email@gmail.com', NULL, 'Sub', 'User', true, 'google', 'stable-sub', NOW(), NOW())
    `;

    mockGooglePayload({
      sub: 'stable-sub',
      email: 'brand-new-email@gmail.com', // changed on Google's side
      email_verified: true,
    });

    const res = await googleAuth({ credential: 'fake-id-token' });

    expect(res.user.id).toBe('existing-2'); // matched by sub, not email
    // No new row was created for the new email.
    expect(await countUsersByEmail('brand-new-email@gmail.com')).toBe(0);
  });

  test('unverified email is rejected with permissionDenied', async () => {
    mockGooglePayload({
      sub: 'google-sub-unverified',
      email: 'unverified@gmail.com',
      email_verified: false,
    });

    await expect(googleAuth({ credential: 'fake-id-token' })).rejects.toMatchObject({
      code: 'permission_denied',
    });

    // No account was created.
    expect(await countUsersByEmail('unverified@gmail.com')).toBe(0);
  });

  test('invalid credential (verify throws) is rejected with unauthenticated, not 500', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Wrong number of segments'));

    await expect(googleAuth({ credential: 'garbage' })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  test('regression: password login for a Google-only account returns clean 401, not 500', async () => {
    // Google-only account has NULL password_hash.
    await scheduleDB.exec`
      INSERT INTO users (id, email, password_hash, is_active, provider, provider_user_id, created_at, updated_at)
      VALUES ('google-only-1', 'googleonly@gmail.com', NULL, true, 'google', 'sub-google-only', NOW(), NOW())
    `;

    await expect(login({ email: 'googleonly@gmail.com', password: 'whatever' })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});
