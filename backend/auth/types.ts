/**
 * Authentication types for STOMP Performance Scheduler
 * 
 * Defines core types for user management, sessions, and authentication flows
 */

// User entity representing a registered user
export interface User {
  id: string;                 // Unique user identifier
  email: string;              // User's email address
  firstName?: string;         // User's first name (optional)
  lastName?: string;          // User's last name (optional)
  createdAt: Date;           // When user account was created
  updatedAt: Date;           // When user account was last updated
  isActive: boolean;         // Whether user account is active
}

// User profile information (subset of User for public display)
export interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

// Authentication session information
export interface AuthSession {
  userId: string;            // ID of authenticated user
  sessionId: string;         // Unique session identifier
  issuedAt: Date;           // When session was created
  expiresAt: Date;          // When session expires
  isActive: boolean;        // Whether session is currently valid
}

// JWT token payload structure
export interface JWTPayload {
  sub: string;              // Subject (user ID)
  email: string;            // User email
  iat: number;              // Issued at timestamp
  exp: number;              // Expiration timestamp
  sessionId: string;        // Session identifier
}

// Authentication request/response types
export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: UserProfile;
  token: string;
  expiresAt: Date;
}

// Authentication context for middleware
export interface AuthContext {
  user: UserProfile;
  session: AuthSession;
  token: string;
}

// Auth configuration
export interface AuthConfig {
  jwtSecret: string;
  tokenExpirationHours: number;
}

// Error types for authentication
export enum AuthErrorCode {
  InvalidCredentials = "INVALID_CREDENTIALS",
  UserNotFound = "USER_NOT_FOUND",
  UserAlreadyExists = "USER_ALREADY_EXISTS",
  InvalidToken = "INVALID_TOKEN",
  TokenExpired = "TOKEN_EXPIRED",
  SessionNotFound = "SESSION_NOT_FOUND",
  Unauthorized = "UNAUTHORIZED",
  InternalError = "INTERNAL_ERROR"
}

export class AuthError extends Error {
  code: AuthErrorCode;
  details?: string;

  constructor(errorInfo: { code: AuthErrorCode; message: string; details?: string }) {
    super(errorInfo.message);
    this.name = 'AuthError';
    this.code = errorInfo.code;
    this.details = errorInfo.details;
  }
}