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
import type { JWTPayload, UserProfile } from './types';

interface AuthParams {
  authorization: Header<"Authorization">;
}

interface AuthData {
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

    try {
      // Verify and decode JWT
      const decoded = jwt.verify(token, authConfig.jwtSecret) as JWTPayload;
      
      // Check token expiration (additional validation)
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < now) {
        throw APIError.unauthenticated("Token expired");
      }

      return {
        userID: decoded.sub,
        email: decoded.email,
        sessionID: decoded.sessionId
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw APIError.unauthenticated("Authentication token has expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw APIError.unauthenticated("Invalid authentication token");
      } else {
        throw APIError.unauthenticated("Token verification failed");
      }
    }
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