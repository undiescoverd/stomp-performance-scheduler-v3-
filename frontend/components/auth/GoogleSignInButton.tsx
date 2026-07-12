/**
 * Google Sign-In Button
 *
 * Renders Google Identity Services' official button (via @react-oauth/google's
 * <GoogleLogin>) using the ID-token flow: on success Google hands us a signed ID
 * token in `credentialResponse.credential`, which we POST to /auth/google. We use
 * <GoogleLogin> (not useGoogleLogin) on purpose — the hook yields an OAuth *access*
 * token the backend can't verify as an ID token.
 *
 * The button only works when wrapped in <GoogleOAuthProvider> (mounted in main.tsx
 * only when VITE_GOOGLE_CLIENT_ID is set), so callers gate its rendering on that env
 * var too.
 */

import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
}

const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ onSuccess }) => {
  const { loginWithGoogle } = useAuth();

  return (
    <GoogleLogin
      // The button is rendered by Google inside an iframe, so it can't be styled
      // with Tailwind — appearance is configured through these props instead.
      theme="outline"
      size="large"
      width="100%"
      text="continue_with"
      onSuccess={async (credentialResponse) => {
        const credential = credentialResponse.credential;
        if (!credential) {
          toast({
            title: 'Google sign-in failed',
            description: 'No credential was returned by Google. Please try again.',
            variant: 'destructive',
          });
          return;
        }

        try {
          await loginWithGoogle(credential);
          onSuccess?.();
        } catch (err) {
          toast({
            title: 'Google sign-in failed',
            description: err instanceof Error ? err.message : 'Please try again.',
            variant: 'destructive',
          });
        }
      }}
      onError={() => {
        toast({
          title: 'Google sign-in failed',
          description: 'Could not complete Google sign-in. Please try again.',
          variant: 'destructive',
        });
      }}
    />
  );
};

export default GoogleSignInButton;
