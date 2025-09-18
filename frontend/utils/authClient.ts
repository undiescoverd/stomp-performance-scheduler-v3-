import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { Client, Local, Environment } from '../client';

export function useAuthenticatedClient() {
  const { getToken, isLoaded } = useAuth();
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    const createAuthenticatedClient = async () => {
      const token = await getToken();
      
      // Use real client, not mock
      const target = import.meta.env.VITE_CLIENT_TARGET || Local;
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