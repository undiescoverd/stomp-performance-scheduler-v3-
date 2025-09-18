import { useAuth } from '@/contexts/AuthContext';

export function useAuthenticatedFetch() {
  const { token } = useAuth();
  
  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...(token && { 'Authorization': `Bearer ${token}` }),
        'Content-Type': 'application/json',
      },
    });
  };
  
  return authenticatedFetch;
}

// Helper function for authenticated API calls with error handling
export async function makeAuthenticatedRequest<T>(
  token: string | null,
  url: string,
  options: RequestInit = {}
): Promise<T> {
  
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