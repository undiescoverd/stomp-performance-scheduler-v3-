/**
 * Main authentication service for STOMP Performance Scheduler
 *
 * Provides user registration, login, session management, and JWT token operations
 */

import { api, APIError } from "encore.dev/api";
import { getAuthData } from "encore.dev/internal/codegen/auth";
import type { AuthData } from "./encore_auth";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { scheduleDB } from '../scheduler/db';
import {
  User,
  UserProfile,
  AuthSession,
  JWTPayload,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  AuthError,
  AuthErrorCode
} from './types';
import { authConfig } from './config';

// Utility functions
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function generateSessionId(): string {
  return 'sess_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
}

async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function createJWTToken(user: UserProfile, sessionId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (authConfig.tokenExpirationHours * 3600);

  const payload: JWTPayload = {
    sub: user.id,
    email: user.email,
    iat: now,
    exp: expiresAt,
    sessionId
  };

  return jwt.sign(payload, authConfig.jwtSecret);
}

function userToProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName
  };
}

// API Endpoints

export interface RegisterResponse {
  user: UserProfile;
  token: string;
  expiresAt: Date;
}

/**
 * Register a new user account
 */
export const register = api<RegisterRequest, RegisterResponse>(
  { expose: true, method: "POST", path: "/auth/register", auth: false },
  async (req) => {
    // Validate input
    if (!req.email || !req.password) {
      throw new AuthError({
        code: AuthErrorCode.InvalidCredentials,
        message: "Email and password are required"
      });
    }

    if (req.password.length < 8) {
      throw new AuthError({
        code: AuthErrorCode.InvalidCredentials,
        message: "Password must be at least 8 characters long"
      });
    }

    const email = req.email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await scheduleDB.queryRow`
      SELECT id FROM users WHERE email = ${email}
    `;

    if (existingUser) {
      throw new AuthError({
        code: AuthErrorCode.UserAlreadyExists,
        message: "A user with this email already exists"
      });
    }

    // Create new user
    const userId = generateId();
    const passwordHash = await hashPassword(req.password);
    const now = new Date();

    await scheduleDB.exec`
      INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
      VALUES (${userId}, ${email}, ${passwordHash}, ${req.firstName || null}, ${req.lastName || null}, true, ${now}, ${now})
    `;

    // Create session
    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + (authConfig.tokenExpirationHours * 3600 * 1000));

    await scheduleDB.exec`
      INSERT INTO user_sessions (id, user_id, session_id, issued_at, expires_at, is_active)
      VALUES (${generateId()}, ${userId}, ${sessionId}, ${now}, ${expiresAt}, true)
    `;

    // Create user profile and token
    const userProfile: UserProfile = {
      id: userId,
      email,
      firstName: req.firstName,
      lastName: req.lastName
    };

    const token = createJWTToken(userProfile, sessionId);

    return {
      user: userProfile,
      token,
      expiresAt
    };
  }
);

export interface LoginResponse {
  user: UserProfile;
  token: string;
  expiresAt: Date;
}

/**
 * Login with email and password
 */
export const login = api<LoginRequest, LoginResponse>(
  { expose: true, method: "POST", path: "/auth/login", auth: false },
  async (req) => {
    if (!req.email || !req.password) {
      throw new AuthError({
        code: AuthErrorCode.InvalidCredentials,
        message: "Email and password are required"
      });
    }

    const email = req.email.toLowerCase().trim();

    // Find user by email
    const userRow = await scheduleDB.queryRow`
      SELECT id, email, password_hash, first_name, last_name, is_active
      FROM users
      WHERE email = ${email}
    `;

    if (!userRow) {
      throw new AuthError({
        code: AuthErrorCode.InvalidCredentials,
        message: "Invalid email or password"
      });
    }

    if (!userRow.is_active) {
      throw new AuthError({
        code: AuthErrorCode.Unauthorized,
        message: "Account is disabled"
      });
    }

    // Verify password
    const isPasswordValid = await verifyPassword(req.password, userRow.password_hash);
    if (!isPasswordValid) {
      throw new AuthError({
        code: AuthErrorCode.InvalidCredentials,
        message: "Invalid email or password"
      });
    }

    // Create session
    const sessionId = generateSessionId();
    const now = new Date();
    const expiresAt = new Date(Date.now() + (authConfig.tokenExpirationHours * 3600 * 1000));

    await scheduleDB.exec`
      INSERT INTO user_sessions (id, user_id, session_id, issued_at, expires_at, is_active)
      VALUES (${generateId()}, ${userRow.id}, ${sessionId}, ${now}, ${expiresAt}, true)
    `;

    // Create user profile and token
    const userProfile: UserProfile = {
      id: userRow.id,
      email: userRow.email,
      firstName: userRow.first_name,
      lastName: userRow.last_name
    };

    const token = createJWTToken(userProfile, sessionId);

    return {
      user: userProfile,
      token,
      expiresAt
    };
  }
);

export interface MeResponse {
  user: UserProfile;
  session: AuthSession;
}

/**
 * Get current user information
 */
export const me = api<void, MeResponse>(
  { expose: true, method: "GET", path: "/auth/me", auth: true },
  async (): Promise<MeResponse> => {
    const authData = await getAuthData<AuthData>();
    if (!authData) {
      throw APIError.unauthenticated("Not authenticated");
    }

    const user = await getUserById(authData.userID);
    if (!user) {
      throw APIError.notFound("User not found");
    }

    const session = await validateSession(authData.sessionID);

    return {
      user: userToProfile(user),
      session: session ?? {
        userId: authData.userID,
        sessionId: authData.sessionID,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true,
      },
    };
  }
);

export interface LogoutResponse {
  success: boolean;
}


/**
 * Logout and invalidate current session
 */
export const logout = api<void, LogoutResponse>(
  { expose: true, method: "POST", path: "/auth/logout", auth: true },
  async (): Promise<LogoutResponse> => {
    const authData = await getAuthData<AuthData>();
    if (authData) {
      await scheduleDB.exec`
        UPDATE user_sessions SET is_active = false WHERE session_id = ${authData.sessionID}
      `;
    }
    return { success: true };
  }
);

/**
 * Utility function to get user by ID (for internal use)
 */
export async function getUserById(userId: string): Promise<User | null> {
  const userRow = await scheduleDB.queryRow`
    SELECT id, email, password_hash, first_name, last_name, is_active, created_at, updated_at
    FROM users
    WHERE id = ${userId}
  `;

  if (!userRow) {
    return null;
  }

  return {
    id: userRow.id,
    email: userRow.email,
    firstName: userRow.first_name,
    lastName: userRow.last_name,
    isActive: userRow.is_active,
    createdAt: new Date(userRow.created_at),
    updatedAt: new Date(userRow.updated_at)
  };
}

/**
 * Utility function to validate session (for internal use)
 */
export async function validateSession(sessionId: string): Promise<AuthSession | null> {
  const sessionRow = await scheduleDB.queryRow`
    SELECT user_id, session_id, issued_at, expires_at, is_active
    FROM user_sessions
    WHERE session_id = ${sessionId} AND is_active = true
  `;

  if (!sessionRow) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(sessionRow.expires_at);

  if (expiresAt < now) {
    // Session expired, mark as inactive
    await scheduleDB.exec`
      UPDATE user_sessions
      SET is_active = false
      WHERE session_id = ${sessionId}
    `;
    return null;
  }

  return {
    userId: sessionRow.user_id,
    sessionId: sessionRow.session_id,
    issuedAt: new Date(sessionRow.issued_at),
    expiresAt,
    isActive: sessionRow.is_active
  };
}
