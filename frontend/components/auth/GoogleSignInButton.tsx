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

import React, { useEffect, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';

// Google's widget only accepts a pixel width (not "100%") and caps it at 400px
// regardless of what's requested, so we measure the container once on mount
// rather than pass a percentage or an arbitrary value tied to the modal's CSS.
const GOOGLE_BUTTON_MAX_WIDTH = 400;

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
}

const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ onSuccess }) => {
  const { loginWithGoogle } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();

  useEffect(() => {
    if (containerRef.current) {
      setWidth(Math.min(containerRef.current.offsetWidth, GOOGLE_BUTTON_MAX_WIDTH));
    }
  }, []);

  return (
    <div ref={containerRef}>
      {width && (
        <GoogleLogin
          // The button is rendered by Google inside an iframe, so it can't be styled
          // with Tailwind — appearance is configured through these props instead.
          theme="outline"
          size="large"
          width={width}
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
      )}
    </div>
  );
};

export default GoogleSignInButton;
