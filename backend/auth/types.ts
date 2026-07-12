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

// Google Sign-In request: the Google-signed ID token (JWT) obtained by the
// frontend from Google Identity Services. Verified server-side against the
// configured Client ID (audience) before establishing identity.
export interface GoogleAuthRequest {
  credential: string;
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
  // Google OAuth Client ID (public value, used as the ID-token audience check).
  // Empty when the GoogleClientID secret is not configured — Google sign-in stays
  // disabled in that state rather than failing app boot.
  googleClientId: string;
}

// Auth failures are raised with Encore's APIError (see auth/auth.ts) so they map to
// proper HTTP status codes and client-visible messages. A plain Error subclass would
// be serialized by Encore as a generic 500 "An internal error occurred", hiding the
// real reason from the client — do not reintroduce one here.