/**
 * Feature flags configuration for STOMP Performance Scheduler Backend
 * 
 * Use these flags to enable/disable features in the backend API.
 */

// Direct feature flag configuration
export const FEATURES = {
  /**
   * Multi-Country Tours functionality
   * Controls access to tour-related API endpoints
   * Set to true to enable tours API endpoints
   */
  MULTI_COUNTRY_TOURS: false,
} as const;

// Environment variable override support
export const FEATURE_FLAGS = {
  /**
   * Check environment variable first, fallback to direct config
   * Environment variable: ENABLE_TOURS=true
   */
  MULTI_COUNTRY_TOURS: 
    process.env.ENABLE_TOURS === 'true' || FEATURES.MULTI_COUNTRY_TOURS,
} as const;

// Type definitions for feature flags
export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * Helper function to check if a feature is enabled
 * @param feature - The feature flag to check
 * @returns boolean indicating if the feature is enabled
 */
export function isFeatureEnabled(feature: FeatureFlag): boolean {
  return FEATURE_FLAGS[feature];
}

// Default export for easier imports
export default FEATURE_FLAGS;