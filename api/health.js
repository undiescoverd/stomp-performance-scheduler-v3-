// Vercel serverless function for health check
export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'STOMP Performance Scheduler API - Vercel Serverless'
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}