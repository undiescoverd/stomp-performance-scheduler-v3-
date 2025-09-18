import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { Client, Local, Environment } from '../client';
import { FEATURE_FLAGS } from '@/config/features';

// Hook for when authentication is enabled
function useAuthenticatedClientWithAuth() {
  const { getToken, isLoaded } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  
  useEffect(() => {
    if (!isLoaded) return;

    const createAuthenticatedClient = async () => {
      const token = await getToken();
      
      // Use real client, not mock
      const target = import.meta.env.VITE_CLIENT_TARGET || Local;
      console.log('Environment variables:', {
        VITE_CLIENT_TARGET: import.meta.env.VITE_CLIENT_TARGET,
        VITE_API_URL: import.meta.env.VITE_API_URL,
        target: target
      });
      const realClient = new Client(target, {
        requestInit: {
          credentials: "include",
          headers: {
            ...(token && { 'Authorization': `Bearer ${token}` }),
          },
        },
      });
      
      setClient(realClient);
    };

    createAuthenticatedClient();
  }, [getToken, isLoaded]);

  return client;
}

  // Hook for when authentication is disabled
function useAuthenticatedClientWithoutAuth() {
  const [client, setClient] = useState<Client | null>(null);
  
  useEffect(() => {
    const createUnauthenticatedClient = async () => {
      // Use real client without auth
      const target = import.meta.env.VITE_CLIENT_TARGET || Local;
      console.log('Environment variables:', {
        VITE_CLIENT_TARGET: import.meta.env.VITE_CLIENT_TARGET,
        VITE_API_URL: import.meta.env.VITE_API_URL,
        target: target
      });
      const realClient = new Client(target, {
        requestInit: {
          credentials: "include",
        },
      });
      
      console.log('Created unauthenticated client:', realClient);
      setClient(realClient);
    };

    createUnauthenticatedClient();
  }, []);

  return client;
}

// Main export hook that chooses based on feature flag
export function useAuthenticatedClient() {
  return FEATURE_FLAGS.AUTHENTICATION_ENABLED ? useAuthenticatedClientWithAuth() : useAuthenticatedClientWithoutAuth();
}

// For non-hook usage, create a factory function
export async function createAuthenticatedClient(getToken: () => Promise<string | null>): Promise<Client> {
  const token = await getToken();
  
  return new Client(
    import.meta.env.VITE_CLIENT_TARGET || Local,
    {
      requestInit: {
        credentials: "include",
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      },
    }
  );
}