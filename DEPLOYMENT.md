# Deployment Guide

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
6. **Add Environment Variables:**
   - `VITE_CLERK_PUBLISHABLE_KEY` = Your Clerk publishable key
   - `VITE_CLIENT_TARGET` = `https://stomp-performance-scheduler-hxdi.encr.app` (production backend URL)
7. **Click "Deploy"**

### Step 2: Update API URL for Production

After deployment, you'll need to update the frontend to use the production backend URL instead of localhost.

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

### Frontend (.env.local)
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

### Production (Vercel)
Add these in Vercel dashboard under Project Settings > Environment Variables:
- `VITE_CLERK_PUBLISHABLE_KEY` = Your production Clerk key

## Clerk Authentication Setup

1. **Go to [Clerk Dashboard](https://dashboard.clerk.com)**
2. **Configure your application:**
   - Add your Vercel domain to allowed origins
   - Set up user restrictions if needed
   - Configure sign-in methods

## Troubleshooting

- **Build fails**: Make sure all dependencies are installed with `bun install`
- **Clerk errors**: Verify your publishable key is correct
- **API errors**: Ensure backend is running and accessible
