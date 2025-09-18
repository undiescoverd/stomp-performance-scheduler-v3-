import { api, APIError } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";

export interface AuthParams {
  userID: string;
}

// Clerk JWT verification
export const auth = authHandler<AuthParams>(async (token: string): Promise<AuthParams> => {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  
  if (!clerkSecretKey) {
    throw APIError.internal("CLERK_SECRET_KEY not configured");
  }

  if (!token) {
    throw APIError.unauthenticated("No token provided");
  }

  try {
    // For Clerk JWT verification, we need to decode the JWT and verify it
    // Clerk JWTs are self-contained and can be verified using their public keys
    const response = await fetch(`https://api.clerk.dev/v1/tokens/verify`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${clerkSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Clerk token verification failed:", response.status, errorText);
      throw APIError.unauthenticated("Invalid token");
    }

    const result = await response.json();
    
    if (!result.sub) {
      throw APIError.unauthenticated("Invalid token: no subject");
    }

    return {
      userID: result.sub,
    };
  } catch (error) {
    console.error("Authentication error:", error);
    throw APIError.unauthenticated("Authentication failed");
  }
});

// Example protected endpoint to test auth
export const me = api(
  { method: "GET", path: "/auth/me", auth: true },
  async (): Promise<{ userID: string }> => {
    const { userID } = auth.data()!;
    return { userID };
  }
);