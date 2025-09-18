# Deployment Guide

## 🚀 Current Deployment Status (January 2025)

The application is successfully deployed and operational with custom JWT authentication:
- ✅ **Backend**: Running on Encore Cloud Platform at `https://stomp-performance-scheduler-hxdi.encr.app`
- ✅ **Frontend**: Deployed on Vercel with automatic GitHub integration  
- ✅ **Authentication**: Custom JWT authentication system (replaced Clerk)
- ✅ **Algorithm**: Latest fairness improvements are live in production
- ✅ **Auto-Deploy**: Pushing to GitHub automatically triggers Vercel deployment

## Quick Deploy to Vercel

### Step 1: Deploy Frontend to Vercel

1. **Go to [Vercel](https://vercel.com)**
2. **Sign in with GitHub**
3. **Click "New Project"**
4. **Import your repository**: `undiescoverd/stomp-performance-scheduler-v3`
5. **Configure the project:**
   - **Root Directory**: `frontend`
   - **Framework**: Vite (auto-detected)
   - **Build Command**: `bun run build`
   - **Output Directory**: `dist`
6. **Environment Variables (Optional):**
   - `VITE_API_URL` = Custom backend URL if needed (defaults to production backend)
7. **Click "Deploy"**

### Step 2: Production Configuration

The application is already configured for production deployment:
- **Backend URL**: `https://stomp-performance-scheduler-hxdi.encr.app` (Encore Cloud)
- **Frontend**: Automatically connects to production backend
- **Environment Variables**: Configured in Vercel dashboard

## Local Development

```bash
# Start backend (in one terminal)
cd backend
encore run

# Start frontend (in another terminal)  
cd frontend
bun run dev
```

## Environment Variables

### Backend (Encore Cloud)
Set these environment variables in your Encore dashboard:
```
AUTH_ENABLED=true
JWT_SECRET=your_secure_64_character_production_secret_here
NODE_ENV=production
```

### Frontend (Optional)
No environment variables required by default. Optionally set:
```
VITE_API_URL=custom_backend_url_if_needed
```

## JWT Authentication System

The application uses a custom JWT authentication system:
- **User Registration**: Email/password with bcrypt hashing
- **Session Management**: JWT tokens with configurable expiration
- **Security**: Secure token validation with Encore native auth handler
- **Database**: User data stored in your own PostgreSQL database

## Troubleshooting

- **Build fails**: Make sure all dependencies are installed with `bun install`
- **Authentication errors**: Check that JWT_SECRET is set in Encore environment
- **API errors**: Ensure backend is running and accessible
- **CORS issues**: Backend automatically handles CORS for auth endpoints
