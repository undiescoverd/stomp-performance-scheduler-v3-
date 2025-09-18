import express from 'express';
import cors from 'cors';
const app = express();
const port = 4000;

// Enable CORS for all routes
app.use(cors({
  origin: [
    'https://stomp-performance-scheduler-v3-frontend.vercel.app',
    'https://stomp-performance-scheduler-v3-fron.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175'
  ],
  credentials: true
}));

app.use(express.json());

// Simple schedules endpoint
app.get('/schedules', (req, res) => {
  res.json({ schedules: [] });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Simple server running on port ${port}`);
});
