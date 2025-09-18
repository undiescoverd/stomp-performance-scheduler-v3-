import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 4000;

// Enable CORS for all routes with specific origins
app.use(cors({
  origin: [
    'https://stomp-performance-scheduler-v3-frontend-pit1z2ooh.vercel.app',
    'https://stomp-performance-scheduler-v3-fron.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Mock data
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

const mockCompany = {
  members: [
    {
      id: "cast-1",
      name: "John Smith", 
      roles: ["Sarge", "Potato"],
      isActive: true,
      gender: "male"
    },
    {
      id: "cast-2",
      name: "Jane Doe",
      roles: ["Mozzie", "Ringo"], 
      isActive: true,
      gender: "female"
    }
  ]
};

// API Routes
app.get('/schedules', (req, res) => {
  console.log('GET /schedules called, returning:', mockSchedules.length, 'schedules');
  res.json({ schedules: mockSchedules });
});

app.get('/schedule/:id', (req, res) => {
  const schedule = mockSchedules.find(s => s.id === req.params.id);
  if (schedule) {
    res.json({ schedule });
  } else {
    res.status(404).json({ error: 'Schedule not found' });
  }
});

app.get('/company', (req, res) => {
  res.json(mockCompany);
});

app.get('/cast-members', (req, res) => {
  res.json({ castMembers: mockCompany.members });
});

app.post('/schedule', (req, res) => {
  const newSchedule = {
    id: `mock-schedule-${Date.now()}`,
    ...req.body,
    shows: req.body.shows || [],
    castMembers: mockCompany.members
  };
  mockSchedules.push(newSchedule);
  res.json({ schedule: newSchedule });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Mock STOMP Performance Scheduler API'
  });
});

// Catch all for unknown routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    availableRoutes: [
      'GET /schedules',
      'GET /schedule/:id', 
      'GET /company',
      'GET /cast-members',
      'POST /schedule',
      'GET /health'
    ]
  });
});

app.listen(port, () => {
  console.log(`Mock STOMP API running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});