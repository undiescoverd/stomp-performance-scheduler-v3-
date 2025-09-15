# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is STOMP Performance Scheduler - a full-stack application for managing theatrical performance schedules. The project uses an Encore backend with a React/TypeScript frontend, specifically designed for scheduling cast members across multiple roles and shows with complex constraints.

### Architecture

- **Backend**: Encore.dev framework with TypeScript services
- **Frontend**: React 19 + TypeScript with Vite, TailwindCSS v4, and Radix UI
- **Package Management**: Bun (configured as packageManager in all package.json files)
- **Monorepo Structure**: Root workspace with `backend` and `frontend` directories

## Development Commands

### Backend Development
```bash
cd backend
encore run                    # Start Encore development server (typically http://localhost:4000)
encore gen client --target leap # Generate frontend client from backend API
```

### Frontend Development
```bash
cd frontend
bun install                    # Install dependencies
npx vite dev                   # Start dev server (typically http://localhost:5173)
```

### Testing
```bash
cd frontend
vitest                         # Run unit tests
npx playwright test            # Run E2E tests (requires backend running)
```

### Building
```bash
cd backend
bun run build                  # Builds frontend and outputs to backend/frontend/dist
```

## Key Technical Details

### Domain Model
The application models theatrical scheduling with these core entities:
- **Cast Members**: Performers with specific eligible roles
- **Roles**: Performance roles (Sarge, Potato, Mozzie, Ringo, Particle, Bin, Cornish, Who)
- **Shows**: Individual performances with date, time, call time, and status
- **Assignments**: Role assignments per show with RED day tracking
- **Schedules**: Complete scheduling containers for a location/week

### Architecture Patterns

#### Backend (Encore)
- Service-based architecture with `scheduler` service
- Type definitions in `scheduler/types.ts` 
- API endpoints follow Encore patterns with automatic client generation
- Business logic separated into discrete modules (create, validate, auto_generate, etc.)

#### Frontend (React)
- React Query for data fetching and caching (5min stale time, 1 retry)
- React Router v7 for navigation
- Component structure: `/components/ui/` for reusable UI, main components at root level
- Path aliases: `@/` for frontend root, `~backend/` for backend imports
- TailwindCSS v4 with custom design system

### Special Constraints
- Gender-specific roles: "Bin" and "Cornish" are female-only roles
- Complex scheduling algorithm handles consecutive show constraints and RED day management
- Cast member eligibility restricted by predefined role assignments

## File Organization

```
├── backend/
│   ├── scheduler/           # Core scheduling service
│   │   ├── types.ts        # Domain type definitions
│   │   ├── algorithm.ts    # Scheduling algorithm
│   │   └── *.ts           # API endpoints and business logic
│   └── frontend/          # Serves built frontend assets
└── frontend/
    ├── components/        # React components
    │   └── ui/           # Reusable UI components (Radix-based)
    ├── utils/            # Utility functions
    └── e2e/             # Playwright E2E tests
```

## Development Notes

- Use `bun` for all package management operations
- Frontend client is auto-generated from backend - regenerate after API changes
- E2E tests require both backend and frontend running
- TailwindCSS v4 is configured with custom animation support
- MSW is configured for API mocking in tests