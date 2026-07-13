/**
 * Tests for the password reset flow (/auth/forgot-password, /auth/reset-password)
 *
 * sendEmail is mocked so the reset link (and its raw token) can be captured
 * without real delivery. Run with `encore test` so the scheduler DB + migrations
 * (including 11_add_password_reset_tokens) are provisioned.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';

// Hoisted so the mock factory (which is hoisted above imports) can reference it.
const { mockSendEmail } = vi.hoisted(() => ({
  mockSendEmail: vi.fn().mockResolvedValue({ delivered: false, provider: 'log' }),
}));

vi.mock('./email', () => ({ sendEmail: mockSendEmail }));

import { forgotPassword, resetPassword } from './password_reset';
import { register, login } from './auth';
import { scheduleDB } from '../scheduler/db';

const EMAIL = 'reset.me@example.com';
const OLD_PASSWORD = 'old-password-123';
const NEW_PASSWORD = 'new-password-456';

function sha256(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Pull the raw token out of the most recently "sent" email body.
function lastEmailedToken(): string {
  expect(mockSendEmail).toHaveBeenCalled();
  const text: string = mockSendEmail.mock.calls[mockSendEmail.mock.calls.length - 1][0].text;
  const match = text.match(/\/reset-password\?token=([A-Za-z0-9_-]+)/);
  expect(match).toBeTruthy();
  return match![1];
}

async function tokenRowsFor(email: string) {
  return scheduleDB.queryAll`
    SELECT prt.id, prt.token_hash, prt.used_at, prt.expires_at
    FROM password_reset_tokens prt
    JOIN users u ON u.id = prt.user_id
    WHERE u.email = ${email}
    ORDER BY prt.created_at ASC
  `;
}

describe('password reset', () => {
  beforeEach(async () => {
    mockSendEmail.mockClear();
    // password_reset_tokens and user_sessions cascade from users, but clear
    // explicitly for a deterministic slate.
    await scheduleDB.exec`DELETE FROM password_reset_tokens`;
    await scheduleDB.exec`DELETE FROM user_sessions`;
    await scheduleDB.exec`DELETE FROM users`;
  });

  test('full lifecycle: forgot -> reset -> old password dead, new password works', async () => {
    await register({ email: EMAIL, password: OLD_PASSWORD });

    const res = await forgotPassword({ email: EMAIL });
    expect(res.success).toBe(true);

    // Token is stored hashed: the raw token from the link must not appear in
    // the DB, but its SHA-256 must.
    const rawToken = lastEmailedToken();
    const rows = await tokenRowsFor(EMAIL);
    expect(rows.length).toBe(1);
    expect(rows[0].token_hash).not.toBe(rawToken);
    expect(rows[0].token_hash).toBe(sha256(rawToken));
    expect(rows[0].used_at).toBeNull();

    const reset = await resetPassword({ token: rawToken, password: NEW_PASSWORD });
    expect(reset.success).toBe(true);

    await expect(login({ email: EMAIL, password: OLD_PASSWORD })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    const relogin = await login({ email: EMAIL, password: NEW_PASSWORD });
    expect(relogin.token).toBeTruthy();
  });

  test('unknown email returns success without creating a token or sending email', async () => {
    const res = await forgotPassword({ email: 'nobody@example.com' });
    expect(res.success).toBe(true);

    const count = await scheduleDB.queryRow`SELECT COUNT(*)::int AS n FROM password_reset_tokens`;
    expect(count?.n).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test('inactive account is treated like an unknown email', async () => {
    await register({ email: EMAIL, password: OLD_PASSWORD });
    await scheduleDB.exec`UPDATE users SET is_active = false WHERE email = ${EMAIL}`;

    const res = await forgotPassword({ email: EMAIL });
    expect(res.success).toBe(true);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test('reset revokes every active session for the account', async () => {
    const reg = await register({ email: EMAIL, password: OLD_PASSWORD });
    await login({ email: EMAIL, password: OLD_PASSWORD }); // a second session

    const activeBefore = await scheduleDB.queryRow`
      SELECT COUNT(*)::int AS n FROM user_sessions
      WHERE user_id = ${reg.user.id} AND is_active = true
    `;
    expect(activeBefore?.n).toBe(2);

    await forgotPassword({ email: EMAIL });
    await resetPassword({ token: lastEmailedToken(), password: NEW_PASSWORD });

    const activeAfter = await scheduleDB.queryRow`
      SELECT COUNT(*)::int AS n FROM user_sessions
      WHERE user_id = ${reg.user.id} AND is_active = true
    `;
    expect(activeAfter?.n).toBe(0);
  });

  test('expired token is rejected', async () => {
    const reg = await register({ email: EMAIL, password: OLD_PASSWORD });

    const rawToken = 'expired-raw-token';
    await scheduleDB.exec`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at)
      VALUES ('prt-expired', ${reg.user.id}, ${sha256(rawToken)}, NOW() - interval '2 hours', NOW() - interval '1 hour')
    `;

    await expect(resetPassword({ token: rawToken, password: NEW_PASSWORD })).rejects.toMatchObject({
      code: 'invalid_argument',
    });
  });

  test('a token is single-use', async () => {
    await register({ email: EMAIL, password: OLD_PASSWORD });
    await forgotPassword({ email: EMAIL });
    const rawToken = lastEmailedToken();

    await resetPassword({ token: rawToken, password: NEW_PASSWORD });
    await expect(
      resetPassword({ token: rawToken, password: 'another-password-789' })
    ).rejects.toMatchObject({ code: 'invalid_argument' });
  });

  test('issuing a new token invalidates the previous one', async () => {
    await register({ email: EMAIL, password: OLD_PASSWORD });

    await forgotPassword({ email: EMAIL });
    const firstToken = lastEmailedToken();

    // Age the first request past the resend cooldown so a second token is minted.
    await scheduleDB.exec`
      UPDATE password_reset_tokens SET created_at = NOW() - interval '10 minutes'
    `;
    await forgotPassword({ email: EMAIL });
    const secondToken = lastEmailedToken();
    expect(secondToken).not.toBe(firstToken);

    await expect(resetPassword({ token: firstToken, password: NEW_PASSWORD })).rejects.toMatchObject({
      code: 'invalid_argument',
    });
    const reset = await resetPassword({ token: secondToken, password: NEW_PASSWORD });
    expect(reset.success).toBe(true);
  });

  test('repeat request inside the cooldown reuses the outstanding token', async () => {
    await register({ email: EMAIL, password: OLD_PASSWORD });

    await forgotPassword({ email: EMAIL });
    await forgotPassword({ email: EMAIL });

    const rows = await tokenRowsFor(EMAIL);
    expect(rows.length).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  test('short password is rejected without consuming the token', async () => {
    await register({ email: EMAIL, password: OLD_PASSWORD });
    await forgotPassword({ email: EMAIL });
    const rawToken = lastEmailedToken();

    await expect(resetPassword({ token: rawToken, password: 'short' })).rejects.toMatchObject({
      code: 'invalid_argument',
    });

    // The token survives the failed attempt and still works.
    const reset = await resetPassword({ token: rawToken, password: NEW_PASSWORD });
    expect(reset.success).toBe(true);
  });

  test('reset link uses a trusted Origin but never an untrusted one', async () => {
    await register({ email: EMAIL, password: OLD_PASSWORD });

    await forgotPassword({ email: EMAIL, origin: 'http://localhost:5173' });
    let text: string = mockSendEmail.mock.calls[0][0].text;
    expect(text).toContain('http://localhost:5173/reset-password?token=');

    await scheduleDB.exec`DELETE FROM password_reset_tokens`;
    mockSendEmail.mockClear();

    await forgotPassword({ email: EMAIL, origin: 'https://evil.example.com' });
    text = mockSendEmail.mock.calls[0][0].text;
    expect(text).not.toContain('evil.example.com');
  });

  test('email delivery failure does not fail the request', async () => {
    await register({ email: EMAIL, password: OLD_PASSWORD });
    mockSendEmail.mockRejectedValueOnce(new Error('smtp on fire'));

    const res = await forgotPassword({ email: EMAIL });
    expect(res.success).toBe(true);
  });
});
