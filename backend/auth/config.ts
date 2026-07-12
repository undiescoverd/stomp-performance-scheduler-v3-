/**
 * Authentication configuration for STOMP Performance Scheduler
 *
 * Handles configuration loading, environment variables, and auth settings
 */

import { secret } from "encore.dev/config";
import { AuthConfig } from "./types";

// JWT signing secret, managed by Encore (encrypted, per-environment). Set with
// `encore secret set --type local JWTSecret` for local dev and
// `encore secret set --type prod JWTSecret` for production — see
// .secrets.local.cue for the no-CLI local override. There is deliberately no
// hardcoded fallback: a missing secret must fail closed, not sign tokens with
// a value anyone with repo access could read.
const jwtSecretValue = secret("JWTSecret");

// Google OAuth Client ID, managed by Encore. Unlike JWTSecret this is a *public*
// value (it's also shipped to the browser as VITE_GOOGLE_CLIENT_ID) and is used
// only as the audience check when verifying Google ID tokens. It is deliberately
// optional: when unset, Google sign-in is disabled and the /auth/google endpoint
// rejects requests — the app still boots and email/password auth is unaffected.
// Set with `encore secret set --type local GoogleClientID` (and `--type prod`).
const googleClientIdValue = secret("GoogleClientID");

// Read the Google Client ID without ever throwing: an unset secret must not break
// app boot, since authConfig is loaded on every authenticated request.
function readGoogleClientId(): string {
  try {
    return googleClientIdValue() || "";
  } catch {
    return "";
  }
}

// Default configuration values
const DEFAULT_CONFIG: Partial<AuthConfig> = {
  tokenExpirationHours: 24, // 24 hours default token expiration
};

/**
 * Load authentication configuration from environment variables
 * Falls back to defaults for development
 */
export function loadAuthConfig(): AuthConfig {
  // Token expiration configuration
  const tokenExpirationHours = process.env.TOKEN_EXPIRATION_HOURS
    ? parseInt(process.env.TOKEN_EXPIRATION_HOURS, 10)
    : DEFAULT_CONFIG.tokenExpirationHours!;

  return {
    jwtSecret: jwtSecretValue(),
    tokenExpirationHours,
    googleClientId: readGoogleClientId(),
  };
}

/**
 * Validate authentication configuration
 * Ensures all required settings are present and valid
 */
export function validateAuthConfig(config: AuthConfig): void {
  if (!config.jwtSecret) {
    throw new Error('JWT secret is required');
  }

  if (config.jwtSecret.length < 32) {
    console.warn('⚠️  JWT secret should be at least 32 characters for security');
  }

  // A non-numeric TOKEN_EXPIRATION_HOURS makes parseInt() return NaN, which
  // silently passes both the <=0 and >168 checks below (NaN comparisons are
  // always false) and then corrupts the JWT's exp claim downstream.
  if (Number.isNaN(config.tokenExpirationHours)) {
    throw new Error('Token expiration hours must be a valid number');
  }

  if (config.tokenExpirationHours <= 0) {
    throw new Error('Token expiration hours must be positive');
  }

  if (config.tokenExpirationHours > 168) { // 7 days
    console.warn('⚠️  Token expiration set to more than 7 days, consider shorter duration for security');
  }

  // Google sign-in is optional: warn (do not throw) when unconfigured so the app
  // still boots pre-credentials with email/password auth fully functional.
  if (!config.googleClientId) {
    console.warn('⚠️  GoogleClientID secret not set — Google sign-in is disabled and /auth/google will reject requests until configured');
  }
}

/**
 * Get validated authentication configuration
 * Loads, validates, and returns the auth config
 */
export function getAuthConfig(): AuthConfig {
  const config = loadAuthConfig();
  validateAuthConfig(config);
  return config;
}

// Feature flag integration
export function isAuthEnabled(): boolean {
  // Check environment variable first
  if (process.env.AUTH_ENABLED !== undefined) {
    return process.env.AUTH_ENABLED === 'true';
  }
  
  // For development, always enable auth
  if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    return true;
  }
  
  // Fall back to checking feature flags from config
  try {
    const { FEATURE_FLAGS } = require('../config/features');
    return FEATURE_FLAGS.AUTHENTICATION_ENABLED || false;
  } catch (error) {
    // If feature flags not available, default to disabled for safety
    return false;
  }
}

// Lazy-loaded configuration instance to avoid initialization during module load
let _authConfig: AuthConfig | null = null;

export function getAuthConfigInstance(): AuthConfig {
  if (!_authConfig) {
    _authConfig = getAuthConfig();
  }
  return _authConfig;
}

// For backward compatibility, export a getter
export const authConfig = {
  get jwtSecret() { return getAuthConfigInstance().jwtSecret; },
  get tokenExpirationHours() { return getAuthConfigInstance().tokenExpirationHours; },
  get googleClientId() { return getAuthConfigInstance().googleClientId; }
};