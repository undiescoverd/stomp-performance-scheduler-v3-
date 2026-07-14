/**
 * Self-service password reset.
 *
 * Flow: POST /auth/forgot-password emails a single-use, 1-hour reset link
 * pointing at the frontend's /reset-password screen; POST /auth/reset-password
 * redeems the link's token, sets the new password, and revokes every active
 * session for the account.
 *
 * Lives in its own module (not auth.ts) so ongoing Google sign-in work in
 * auth.ts stays conflict-free.
 */

import { api, APIError, Header } from "encore.dev/api";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";
import { scheduleDB } from "../scheduler/db";
import { sendEmail } from "./email";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // reset links expire after 1 hour
const RESEND_COOLDOWN_MINUTES = 2; // at most one reset email per user per 2 minutes

// Optional override for the frontend origin used in reset links, for setups
// where the request Origin isn't usable (e.g. emails triggered server-side).
// Read never-throws, matching the other optional secrets in this service.
const frontendBaseUrlValue = secret("FrontendBaseURL");

// Last-resort default when neither a trusted Origin nor the secret is
// available. Staging serves as production for the closed alpha.
const DEFAULT_FRONTEND_BASE_URL =
  "https://staging-stomp-performance-scheduler-hxdi.frontend.encr.app";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Only echo the caller's Origin into a reset link when it is provably one of
// our own frontends. Trusting an arbitrary Origin would let an attacker mint
// legitimate reset emails whose links lead to a phishing site.
function isTrustedOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  const host = url.hostname;

  if (url.protocol === "https:") {
    // Only the per-environment frontends (production-…, staging-…) are real,
    // served hosts. The env-less "<appid>.frontend.encr.app" maps to no
    // deployment (Encore's edge 500s "application not found"), so it must not
    // be trusted — a reset link pointing there would be dead.
    return host.endsWith("-stomp-performance-scheduler-hxdi.frontend.encr.app");
  }

  if (url.protocol === "http:") {
    return host === "localhost" || host === "127.0.0.1";
  }

  return false;
}

function resolveFrontendBaseUrl(origin?: string): string {
  if (origin && isTrustedOrigin(origin)) {
    return origin.replace(/\/+$/, "");
  }

  let fromSecret = "";
  try {
    fromSecret = frontendBaseUrlValue() || "";
  } catch {
    fromSecret = "";
  }
  if (fromSecret) {
    return fromSecret.replace(/\/+$/, "");
  }

  log.warn("no trusted Origin or FrontendBaseURL secret; using default frontend URL for reset link", {
    origin: origin ?? null,
  });
  return DEFAULT_FRONTEND_BASE_URL;
}

export interface ForgotPasswordRequest {
  email: string;
  origin?: Header<"Origin">;
}

export interface ForgotPasswordResponse {
  success: boolean;
}

/**
 * Request a password reset link.
 *
 * Always returns success — whether or not the email matches an account — so
 * the endpoint can't be used to enumerate registered addresses.
 */
export const forgotPassword = api<ForgotPasswordRequest, ForgotPasswordResponse>(
  { expose: true, method: "POST", path: "/auth/forgot-password", auth: false },
  async (req) => {
    if (!req.email) {
      throw APIError.invalidArgument("Email is required");
    }

    const email = req.email.toLowerCase().trim();

    const user = await scheduleDB.queryRow<{ id: string; is_active: boolean }>`
      SELECT id, is_active FROM users WHERE email = ${email}
    `;
    if (!user || !user.is_active) {
      return { success: true };
    }

    // Rate-light: if a token was issued moments ago, don't mint another —
    // repeated clicks (or abuse) reuse the outstanding link.
    const recent = await scheduleDB.queryRow<{ id: string }>`
      SELECT id FROM password_reset_tokens
      WHERE user_id = ${user.id}
        AND created_at > NOW() - make_interval(mins => ${RESEND_COOLDOWN_MINUTES})
    `;
    if (recent) {
      return { success: true };
    }

    // Only the newest link may be live.
    await scheduleDB.exec`
      UPDATE password_reset_tokens SET used_at = NOW()
      WHERE user_id = ${user.id} AND used_at IS NULL
    `;

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);

    await scheduleDB.exec`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at)
      VALUES (${generateId()}, ${user.id}, ${hashToken(rawToken)}, ${now}, ${expiresAt})
    `;

    const resetUrl = `${resolveFrontendBaseUrl(req.origin)}/reset-password?token=${rawToken}`;

    try {
      await sendEmail({
        to: email,
        subject: "Reset your STOMP Scheduler password",
        text:
          `A password reset was requested for your STOMP Performance Scheduler account.\n\n` +
          `Reset your password: ${resetUrl}\n\n` +
          `This link expires in 1 hour and can be used once. ` +
          `If you didn't request this, you can ignore this email.`,
      });
    } catch (err) {
      // sendEmail shouldn't throw, but delivery problems must never surface
      // as a failed request (that would leak which emails have accounts).
      log.error("failed to send password reset email", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { success: true };
  }
);

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface ResetPasswordResponse {
  success: boolean;
}

/**
 * Redeem a reset token and set a new password.
 *
 * On success every outstanding reset token and every active session for the
 * account is revoked; the user signs in again with the new password.
 */
export const resetPassword = api<ResetPasswordRequest, ResetPasswordResponse>(
  { expose: true, method: "POST", path: "/auth/reset-password", auth: false },
  async (req) => {
    if (!req.token) {
      throw APIError.invalidArgument("Invalid or expired reset link");
    }

    if (!req.password || req.password.length < 8) {
      throw APIError.invalidArgument("Password must be at least 8 characters long");
    }

    // One generic error for unknown/expired/used tokens: distinguishing them
    // would tell an attacker which guesses were once-valid tokens.
    const tokenRow = await scheduleDB.queryRow<{ user_id: string }>`
      SELECT prt.user_id
      FROM password_reset_tokens prt
      JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = ${hashToken(req.token)}
        AND prt.used_at IS NULL
        AND prt.expires_at > NOW()
        AND u.is_active = true
    `;
    if (!tokenRow) {
      throw APIError.invalidArgument("Invalid or expired reset link");
    }

    const passwordHash = await bcrypt.hash(req.password, 12);
    await scheduleDB.exec`
      UPDATE users SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE id = ${tokenRow.user_id}
    `;

    await scheduleDB.exec`
      UPDATE password_reset_tokens SET used_at = NOW()
      WHERE user_id = ${tokenRow.user_id} AND used_at IS NULL
    `;

    // A password reset usually means "someone else may have my credentials":
    // kill every live session. The authHandler re-checks is_active per
    // request, so revocation takes effect immediately.
    await scheduleDB.exec`
      UPDATE user_sessions SET is_active = false
      WHERE user_id = ${tokenRow.user_id} AND is_active = true
    `;

    return { success: true };
  }
);
