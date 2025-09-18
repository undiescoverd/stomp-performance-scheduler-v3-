import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';

// Mock schedule data for demo purposes
const mockScheduleData = {
  schedules: [
    {
      id: "demo-schedule-1",
      city: "London",
      weekNumber: 39,
      location: "London",
      startDate: "2024-09-22",
      endDate: "2024-09-28",
      shows: [
        {
          id: "show-1",
          date: "2024-09-23",
          time: "8:00 PM",
          callTime: "6:00 PM",
          status: "scheduled"
        },
        {
          id: "show-2",
          date: "2024-09-24",
          time: "8:00 PM", 
          callTime: "6:00 PM",
          status: "scheduled"
        },
        {
          id: "show-3",
          date: "2024-09-25",
          time: "8:00 PM",
          callTime: "6:00 PM", 
          status: "scheduled"
        }
      ],
      castMembers: [
        {
          id: "cast-1",
          name: "John Smith",
          roles: ["Sarge", "Potato"],
          isActive: true
        },
        {
          id: "cast-2",
          name: "Jane Doe",
          roles: ["Mozzie", "Ringo"],
          isActive: true
        }
      ]
    }
  ]
};

// Mock client interface to match expected structure
const mockClient = {
  scheduler: {
    list: () => Promise.resolve(mockScheduleData),
    deleteSchedule: ({ id }: { id: string }) => Promise.resolve(),
    get: ({ id }: { id: string }) => Promise.resolve(mockScheduleData.schedules[0]),
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