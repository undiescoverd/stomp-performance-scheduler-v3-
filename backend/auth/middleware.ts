/**
 * Authentication middleware for STOMP Performance Scheduler
 * 
 * Provides JWT token validation and user context extraction for protected endpoints
 */

import jwt from 'jsonwebtoken';
import { Request } from 'encore.dev/api';
import { 
  AuthContext, 
  JWTPayload, 
  UserProfile, 
  AuthSession, 
  AuthError, 
  AuthErrorCode 
} from './types';
import { authConfig, isAuthEnabled } from './config';

/**
 * Extract JWT token from Authorization header
 */
function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  // Expected format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Verify and decode JWT token
 */
function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, authConfig.jwtSecret) as JWTPayload;
    
    // Check token expiration (additional validation)
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      throw new Error('Token expired');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Authentication token has expired - please log in again');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error(`Invalid authentication token: ${error.message}`);
    } else {
      throw new Error(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Create user profile from JWT payload
 */
function createUserProfile(payload: JWTPayload): UserProfile {
  return {
    id: payload.sub,
    email: payload.email,
    // firstName and lastName can be added to JWT payload later
  };
}

/**
 * Create auth session from JWT payload
 */
function createAuthSession(payload: JWTPayload): AuthSession {
  return {
    userId: payload.sub,
    sessionId: payload.sessionId,
    issuedAt: new Date(payload.iat * 1000),
    expiresAt: new Date(payload.exp * 1000),
    isActive: true
  };
}

/**
 * Authenticate request and extract user context
 * Returns null if authentication is disabled or optional
 */
export async function authenticateRequest(req: Request): Promise<AuthContext | null> {
  // If authentication is globally disabled, return null
  if (!isAuthEnabled()) {
    return null;
  }

  // Extract token from Authorization header
  const authHeader = req.headers?.authorization;
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    throw new Error('Authentication required: Missing or invalid Authorization header');
  }

  // Verify and decode token
  const payload = verifyToken(token);

  // Create auth context
  const user = createUserProfile(payload);
  const session = createAuthSession(payload);

  return {
    user,
    session,
    token
  };
}

/**
 * Authenticate request optionally (doesn't throw if no auth)
 * Useful for endpoints that support both authenticated and unauthenticated access
 */
export async function authenticateRequestOptional(req: Request): Promise<AuthContext | null> {
  try {
    return await authenticateRequest(req);
  } catch (error) {
    // If authentication fails or is disabled, return null instead of throwing
    if (error instanceof Error && 
        (error.message.includes('Authentication required') || 
         error.message.includes('Invalid authentication token') ||
         error.message.includes('Token expired'))) {
      return null;
    }
    
    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Middleware wrapper for protecting Encore API endpoints
 * Usage: Use in API handlers that require authentication
 */
export function requireAuth<T, R>(
  handler: (req: T, auth: AuthContext) => Promise<R>
): (req: T) => Promise<R> {
  return async (req: T) => {
    // Cast to access headers (Encore's Request interface)
    const encoreReq = req as any;
    const authContext = await authenticateRequest(encoreReq);
    
    if (!authContext) {
      throw new Error('Authentication required: This endpoint requires authentication');
    }

    return handler(req, authContext);
  };
}

/**
 * Middleware wrapper for optional authentication
 * Usage: Use in API handlers that work with or without authentication
 */
export function optionalAuth<T, R>(
  handler: (req: T, auth: AuthContext | null) => Promise<R>
): (req: T) => Promise<R> {
  return async (req: T) => {
    // Cast to access headers (Encore's Request interface)
    const encoreReq = req as any;
    const authContext = await authenticateRequestOptional(encoreReq);
    
    return handler(req, authContext);
  };
}