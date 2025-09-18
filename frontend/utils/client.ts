// Simple API client for the STOMP Performance Scheduler
// In production, use same domain for API. In development, use localhost:4000
const API_BASE_URL = import.meta.env.PROD 
  ? '' // Use relative URLs in production (same domain)
  : (import.meta.env.VITE_API_URL || 'http://localhost:4000');

export class Client {
  constructor(private baseURL: string = API_BASE_URL) {}

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Schedules
  async getSchedules() {
    return this.request('/api/schedules');
  }

  // Health check
  async health() {
    return this.request('/health');
  }
}

// Local client instance
export const Local = new Client();