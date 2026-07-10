/**
 * Encore.ts Native Authentication Handler
 *
 * Uses Encore's built-in authentication system instead of custom middleware
 */

import { Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { APIError } from "encore.dev/api";
import jwt from 'jsonwebtoken';
import { authConfig, isAuthEnabled } from './config';
import { scheduleDB } from '../scheduler/db';
import type { JWTPayload, UserProfile } from './types';

interface AuthParams {
  authorization: Header<"Authorization">;
}

export interface AuthData {
  userID: string;
  email: string;
  sessionID: string;
}

/**
 * Encore's built-in authentication handler
 * This is called automatically for endpoints with { auth: true }
 */
export const auth = authHandler<AuthParams, AuthData>(
  async (params) => {
    // If authentication is globally disabled, reject
    if (!isAuthEnabled()) {
      throw APIError.unauthenticated("Authentication is disabled");
    }

    // Extract JWT from Authorization header
    const authHeader = params.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw APIError.unauthenticated("Invalid authorization header format");
    }

    const token = authHeader.replace('Bearer ', '');

    let decoded: JWTPayload;
    try {
      // Verify and decode JWT
      decoded = jwt.verify(token, authConfig.jwtSecret) as JWTPayload;

      // Check token expiration (additional validation)
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < now) {
        throw APIError.unauthenticated("Token expired");
      }
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      } else if (error instanceof jwt.TokenExpiredError) {
        throw APIError.unauthenticated("Authentication token has expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw APIError.unauthenticated("Invalid authentication token");
      } else {
        throw APIError.unauthenticated("Token verification failed");
      }
    }

    // Verify the session is still active so logout/revocation actually takes effect.
    const sessionRow = await scheduleDB.queryRow`
      SELECT 1 FROM user_sessions
      WHERE session_id = ${decoded.sessionId} AND is_active = true AND expires_at > NOW()
    `;
    if (!sessionRow) {
      throw APIError.unauthenticated("Session is no longer active");
    }

    return {
      userID: decoded.sub,
      email: decoded.email,
      sessionID: decoded.sessionId
    };
  }
);

/**
 * Helper function to create UserProfile from AuthData
 */
export function createUserProfileFromAuth(authData: AuthData): UserProfile {
  return {
    id: authData.userID,
    email: authData.email,
  };
}
