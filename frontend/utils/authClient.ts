import { Client, Local } from '../client';
import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';

// Create an authenticated client that includes Clerk tokens
export function useAuthenticatedClient() {
  const { getToken, isLoaded } = useAuth();
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    const createAuthenticatedClient = async () => {
      const token = await getToken();
      
      const authClient = new Client(
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
      
      setClient(authClient);
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