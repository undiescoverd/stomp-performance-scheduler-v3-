# Development Guide

This project consists of an Encore application with a React frontend. Follow the steps below to get the app running locally.

## 🎯 Current Status (January 2025)

The application is fully functional with recent critical improvements:
- ✅ **Algorithm Fairness Fixed**: All 12 performers now get exactly one RED day per week
- ✅ **Smart Scheduling**: Weekday preference for RED days with load balancing
- ✅ **Comprehensive Testing**: 11 tests with 356 assertions verify correctness
- ✅ **Production Ready**: Deployed and working on localhost and Vercel

## Prerequisites

If this is your first time using Encore, you need to install the CLI that runs the local development environment. Use the appropriate command for your system:

- **macOS:** `brew install encoredev/tap/encore`
- **Linux:** `curl -L https://encore.dev/install.sh | bash`
- **Windows:** `iwr https://encore.dev/install.ps1 | iex`

You also need to have bun installed for package management. If you don't have bun installed, you can install it by running:

```bash
npm install -g bun
```

## Running the Application

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Start the Encore development server:
   ```bash
   encore run
   ```

The backend will be available at the URL shown in your terminal (typically `http://localhost:4000`).



### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install the dependencies:
   ```bash
   bun install
   ```

3. Start the development server:
   ```bash
   bun run dev
   ```

The frontend will be available at `http://localhost:5173` (or the next available port).


### Generate Frontend Client
To generate the frontend client, run the following command in the `backend` directory:

```bash
encore gen client --target leap
```

### Testing the Algorithm
To verify the scheduling algorithm is working correctly:

```bash
cd backend
bun test scheduler/algorithm.test.ts
```

This will run 11 tests with 356 assertions to verify:
- All 12 performers get exactly one RED day
- RED days are assigned to weekdays (Tuesday-Friday)
- Load balancing across different weekdays
- All existing constraints are preserved

## Deployment

### Self-hosting
See the [self-hosting instructions](https://encore.dev/docs/self-host/docker-build) for how to use encore build docker to create a Docker image and
configure it.

### Encore Cloud Platform

#### Step 1: Login to your Encore Cloud Account

Before deploying, ensure you have authenticated the Encore CLI with your Encore account (same as your Leap account)

```bash
encore auth login
```

#### Step 2: Set Up Git Remote

Add Encore's git remote to enable direct deployment:

```bash
git remote add encore encore://stomp-performance-scheduler-hxdi
```

#### Step 3: Deploy Your Application

Deploy by pushing your code:

```bash
git add -A .
git commit -m "Deploy to Encore Cloud"
git push encore
```

Monitor your deployment progress in the [Encore Cloud dashboard](https://app.encore.dev/stomp-performance-scheduler-hxdi/deploys).

## GitHub Integration (Recommended for Production)

For production applications, we recommend integrating with GitHub instead of using Encore's managed git:

### Connecting Your GitHub Account

1. Open your app in the **Encore Cloud dashboard**
2. Navigate to Encore Cloud [GitHub Integration settings](https://app.encore.cloud/stomp-performance-scheduler-hxdi/settings/integrations/github)
3. Click **Connect Account to GitHub**
4. Grant access to your repository

Once connected, pushing to your GitHub repository will automatically trigger deployments. Encore Cloud Pro users also get Preview Environments for each pull request.

### Deploy via GitHub

After connecting GitHub, deploy by pushing to your repository:

```bash
git add -A .
git commit -m "Deploy via GitHub"
git push origin main
```

## Additional Resources

- [Encore Documentation](https://encore.dev/docs)
- [Deployment Guide](https://encore.dev/docs/platform/deploy/deploying)
- [GitHub Integration](https://encore.dev/docs/platform/integrations/github)
- [Encore Cloud Dashboard](https://app.encore.dev)



