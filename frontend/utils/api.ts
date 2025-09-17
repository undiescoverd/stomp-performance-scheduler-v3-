import { useAuth } from '@clerk/clerk-react';

export function useAuthenticatedFetch() {
  const { getToken } = useAuth();
  
  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const token = await getToken();
    
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  };
  
  return authenticatedFetch;
}

// Helper function for authenticated API calls with error handling
export async function makeAuthenticatedRequest<T>(
  getToken: () => Promise<string | null>,
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}