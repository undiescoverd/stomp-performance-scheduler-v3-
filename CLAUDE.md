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
bun run dev                    # Start dev server (typically http://localhost:5173)
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
- **Tours**: Multi-week scheduling containers with automatic bulk creation capabilities

### Architecture Patterns

#### Backend (Encore)
- Service-based architecture with `scheduler` and `tours` services
- Type definitions in `scheduler/types.ts` and `scheduler/tour_types.ts`
- API endpoints follow Encore patterns with automatic client generation
- Business logic separated into discrete modules (create, validate, auto_generate, tours, etc.)
- Database migrations for tours and schedule extensions

#### Frontend (React)
- React Query for data fetching and caching (5min stale time, 1 retry)
- React Router v7 for navigation with routes: /, /schedule/:id, /company, /tours
- Component structure: `/components/ui/` for reusable UI, `/components/tours/` for tour management
- Path aliases: `@/` for frontend root, `~backend/` for backend imports
- TailwindCSS v4 with custom design system and Radix UI components

### Special Constraints
- Gender-specific roles: "Bin" and "Cornish" are female-only roles
- Complex scheduling algorithm handles consecutive show constraints and RED day management
- Cast member eligibility restricted by predefined role assignments

### Recent Features & Improvements
- **Tour Bulk Creation**: Complete multi-week tour management system with bulk scheduling
- **Professional PDF Export**: STOMP-formatted PDF schedules with proper layout and branding
- **Live Week Updates**: Dynamic week number calculation and display in scheduler title
- **Algorithm Determinism**: Fixed caching and seeding issues for consistent schedule generation
- **Consecutive Show Optimization**: Improved warnings (only for 6+ consecutive shows)
- **Clean RED Day Display**: Removed redundant 'R' indicators from RED day displays
- **Enhanced UI**: Improved schedule editor with better visual design and usability

### Tour Bulk Creation System
- **Cast Management**: Select exactly 12 cast members with archive/activate functionality
- **Week Configuration**: Standard 8-show weeks or custom day-by-day schedules
- **Bulk Generation**: Create 1-12 weeks simultaneously with auto-generated assignments
- **Tour Organization**: Folder-style view with expandable tour segments
- **Individual Editing**: Edit any schedule after bulk creation
- **Quick Add Cast**: Add new cast members during tour creation workflow

## File Organization

```
├── backend/
│   ├── scheduler/           # Core scheduling service
│   │   ├── types.ts        # Domain type definitions
│   │   ├── tour_types.ts   # Tour-specific type definitions
│   │   ├── algorithm.ts    # Scheduling algorithm
│   │   ├── tours.ts        # Tour bulk creation API endpoints
│   │   ├── migrations/     # Database schema migrations
│   │   └── *.ts           # Other API endpoints and business logic
│   └── frontend/          # Serves built frontend assets
└── frontend/
    ├── components/        # React components
    │   ├── ui/           # Reusable UI components (Radix-based)
    │   └── tours/        # Tour management components
    ├── utils/            # Utility functions
    └── e2e/             # Playwright E2E tests
```

## Development Notes

- Use `bun` for all package management operations
- Frontend client is auto-generated from backend - regenerate after API changes
- E2E tests require both backend and frontend running
- TailwindCSS v4 is configured with custom animation support
- MSW is configured for API mocking in tests