// Vercel serverless function for schedules endpoint
export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Mock schedule data
  const mockSchedules = [
    {
      id: "mock-schedule-1",
      city: "London", 
      weekNumber: 39,
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
  ];

  if (req.method === 'GET') {
    console.log('GET /api/schedules called, returning:', mockSchedules.length, 'schedules');
    res.status(200).json({ schedules: mockSchedules });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}