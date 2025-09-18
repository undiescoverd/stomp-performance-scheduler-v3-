/**
 * Basic tests for authentication service
 * 
 * Tests to verify the auth service compiles and basic functionality works
 */

import { describe, test, expect } from 'vitest';
import { AuthError, AuthErrorCode } from './types';
import { authConfig } from './config';

describe('Auth Types and Config', () => {
  test('AuthError class works correctly', () => {
    const error = new AuthError({
      code: AuthErrorCode.InvalidCredentials,
      message: 'Test error',
      details: 'Test details'
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AuthError');
    expect(error.code).toBe(AuthErrorCode.InvalidCredentials);
    expect(error.message).toBe('Test error');
    expect(error.details).toBe('Test details');
  });

  test('Auth config loads correctly', () => {
    expect(authConfig).toBeDefined();
    expect(authConfig.jwtSecret).toBeDefined();
    expect(authConfig.tokenExpirationHours).toBeGreaterThan(0);
  });

  test('Auth error codes are defined', () => {
    expect(AuthErrorCode.InvalidCredentials).toBe('INVALID_CREDENTIALS');
    expect(AuthErrorCode.UserNotFound).toBe('USER_NOT_FOUND');
    expect(AuthErrorCode.UserAlreadyExists).toBe('USER_ALREADY_EXISTS');
    expect(AuthErrorCode.InvalidToken).toBe('INVALID_TOKEN');
    expect(AuthErrorCode.TokenExpired).toBe('TOKEN_EXPIRED');
    expect(AuthErrorCode.SessionNotFound).toBe('SESSION_NOT_FOUND');
    expect(AuthErrorCode.Unauthorized).toBe('UNAUTHORIZED');
    expect(AuthErrorCode.InternalError).toBe('INTERNAL_ERROR');
  });
});

// Integration test would go here once the service is accessible
describe('Auth Service Integration', () => {
  test.skip('Registration endpoint should exist (skipped - service not accessible yet)', () => {
    // This test will be enabled once we confirm the auth service is accessible
    // via the API endpoints
  });
});