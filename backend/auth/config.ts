/**
 * Authentication configuration for STOMP Performance Scheduler
 * 
 * Handles configuration loading, environment variables, and auth settings
 */

import { AuthConfig } from "./types";

// Default configuration values
const DEFAULT_CONFIG: Partial<AuthConfig> = {
  tokenExpirationHours: 24, // 24 hours default token expiration
};

/**
 * Load authentication configuration from environment variables
 * Falls back to defaults for development
 */
export function loadAuthConfig(): AuthConfig {
  // JWT Secret - required for token signing
  const jwtSecret = process.env.JWT_SECRET || process.env.ENCORE_JWT_SECRET;
  if (!jwtSecret) {
    // For development, generate a warning but use a default
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  JWT_SECRET not set, using default for development');
    } else {
      throw new Error('JWT_SECRET environment variable is required for production');
    }
  }

  // Token expiration configuration
  const tokenExpirationHours = process.env.TOKEN_EXPIRATION_HOURS 
    ? parseInt(process.env.TOKEN_EXPIRATION_HOURS, 10)
    : DEFAULT_CONFIG.tokenExpirationHours!;

  return {
    jwtSecret: jwtSecret || 'dev-secret-key-change-in-production',
    tokenExpirationHours,
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

  if (config.tokenExpirationHours <= 0) {
    throw new Error('Token expiration hours must be positive');
  }

  if (config.tokenExpirationHours > 168) { // 7 days
    console.warn('⚠️  Token expiration set to more than 7 days, consider shorter duration for security');
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
  
  // Fall back to checking feature flags from config
  try {
    const { FEATURE_FLAGS } = require('../config/features');
    return FEATURE_FLAGS.AUTHENTICATION_ENABLED || false;
  } catch (error) {
    // If feature flags not available, default to disabled for safety
    return false;
  }
}

// Export default configuration instance
export const authConfig = getAuthConfig();