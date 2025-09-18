import { Local } from './client';
import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';

// Mock client interface to match expected structure
const mockClient = {
  scheduler: {
    list: () => Local.getSchedules(),
    deleteSchedule: ({ id }: { id: string }) => Promise.resolve(),
    get: ({ id }: { id: string }) => Promise.resolve(null),
  }
};

// Create an authenticated client that includes Clerk tokens
export function useAuthenticatedClient() {
  const { getToken, isLoaded } = useAuth();
  const [client, setClient] = useState<typeof mockClient | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    const createAuthenticatedClient = async () => {
      const token = await getToken();
      
      // Use our simple client instead of the Encore client
      setClient(mockClient);
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