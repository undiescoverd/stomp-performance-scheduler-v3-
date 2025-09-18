/**
 * Feature flags configuration for STOMP Performance Scheduler
 * 
 * Use these flags to enable/disable features across the application.
 * Supports both direct configuration and environment variables.
 */

// Direct feature flag configuration
export const FEATURES = {
  /**
   * Multi-Country Tours functionality
   * Controls visibility and access to tour management features
   * Set to true to enable tours functionality
   */
  MULTI_COUNTRY_TOURS: false,
  
  /**
   * Authentication functionality
   * Controls whether Clerk authentication is required
   * Set to false to disable authentication temporarily
   */
  AUTHENTICATION_ENABLED: false,
} as const;

// Environment variable override support
// Note: For environment variables, use VITE_ENABLE_TOURS=true and update this logic
export const FEATURE_FLAGS = {
  /**
   * Multi-Country Tours functionality
   * Set to true to enable tours functionality
   * For environment override, set VITE_ENABLE_TOURS=true in .env and update this logic
   */
  MULTI_COUNTRY_TOURS: FEATURES.MULTI_COUNTRY_TOURS,
  
  /**
   * Authentication functionality
   * Set to true to enable Clerk authentication
   * Currently disabled to match backend auth: false setting
   */
  AUTHENTICATION_ENABLED: FEATURES.AUTHENTICATION_ENABLED,
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