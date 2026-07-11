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

### Running Servers (tmux — always use this, never foreground/nohup)

Always start and restart the dev servers inside a dedicated tmux session named
`stomp`, one window per server. Do not run `encore run` or `bun run dev` directly
in the foreground of a Claude Code shell — those processes get orphaned when the
shell session ends (leaked `encore run` / built `combined/main.mjs` processes have
had to be manually killed before). tmux keeps them alive independently and lets
their output be inspected at any time.

To (re)start both servers from scratch:
```bash
tmux kill-session -t stomp 2>/dev/null
tmux new-session -d -s stomp -n backend -c /Users/ianvincent/workspace/stomp-performance-scheduler-v3/backend
tmux send-keys -t stomp:backend "encore run" C-m
tmux new-window -t stomp -n frontend -c /Users/ianvincent/workspace/stomp-performance-scheduler-v3/frontend
tmux send-keys -t stomp:frontend "bun run dev" C-m
```

Before restarting, check for and kill any stray non-tmux server processes first
(`ps aux | grep -iE "encore run|combined/main.mjs"`) — orphaned runs from prior
foreground sessions will otherwise keep holding the ports.

Useful commands:
```bash
tmux list-windows -t stomp                   # confirm both windows are up
tmux capture-pane -t stomp:backend -p | tail -30   # check backend output/errors
tmux capture-pane -t stomp:frontend -p | tail -30  # check frontend output/errors
tmux attach -t stomp                         # attach interactively (Ctrl-b d to detach)
```

Backend: http://127.0.0.1:4000 · Frontend: http://localhost:5173 (Vite binds to
`[::1]`, so use `localhost` rather than `127.0.0.1` when curling it).

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
- Gender-specific roles: "Bin" and "Cornish" are conventionally cast with a female
  performer, but this is a casting convention rather than a hard rule — in rare cases a
  male performer covers them when absolutely needed. Enforcement reflects this:
  - **Auto-generation** only ever picks a female performer for Bin/Cornish
    (`FEMALE_ONLY_ROLES` in `scheduler/types.ts` gates the candidate pool).
  - **Manual assignment** of a male performer is allowed. It raises a
    `GENDER_VIOLATION` **warning**, not an error, so it never blocks a save or trips
    the auto-generate retry gate (`GENDER_VIOLATION` is deliberately absent from
    `CRITICAL_RULE_CODES` in `scheduler/algorithm.ts`).
  - `deriveGender()` in `scheduler/company.ts` only infers gender from eligibility when
    the caller omits it; an explicit `gender` always wins.
- Complex scheduling algorithm handles consecutive show constraints and RED day management
- Cast member eligibility restricted by predefined role assignments

### Recent Features & Improvements
- **Algorithm Fairness Fix (v3.1)**: Critical fix ensuring all 12 performers get exactly one RED day per week
- **Smart RED Day Assignment**: Weekday preference (Tuesday-Friday) with intelligent load balancing
- **Forced RED Day Creation**: Algorithm creates RED days for performers without natural days off
- **Comprehensive Testing**: 11 tests with 356 assertions verify algorithm correctness
- **Tour Bulk Creation**: Complete multi-week tour management system with bulk scheduling
- **Professional PDF Export**: STOMP-formatted PDF schedules with proper layout and branding
- **Live Week Updates**: Dynamic week number calculation and display in scheduler title
- **Algorithm Determinism**: Fixed caching and seeding issues for consistent schedule generation
- **Consecutive Show Optimization**: Improved warnings (only for 6+ consecutive shows)
- **Clean RED Day Display**: Removed redundant 'R' indicators from RED day displays
- **Enhanced UI**: Improved schedule editor with better visual design and usability
- **Tour Modal Flow Fix**: Fixed modal transition issue where WeekSetupModal failed to open after cast selection
- **Authentication System Fix**: Removed broken auth dependencies and temporarily disabled authentication for stability
- **Production Deployment Fix**: Resolved critical compilation errors preventing Vercel deployment

### Tour Bulk Creation System
- **Cast Management**: Select exactly 12 cast members with archive/activate functionality
- **Week Configuration**: Standard 8-show weeks or custom day-by-day schedules
- **Bulk Generation**: Create 1-12 weeks simultaneously with auto-generated assignments
- **Tour Organization**: Folder-style view with expandable tour segments
- **Individual Editing**: Edit any schedule after bulk creation
- **Quick Add Cast**: Add new cast members during tour creation workflow

#### Tour Creation Workflow
1. **Cast Selection** (`CastSelectionModal`): Select exactly 12 active cast members
2. **Week Configuration** (`WeekSetupModal`): Configure tour details, dates, and week schedules
3. **Bulk Creation**: Generate all schedules with automatic role assignments
4. **Tour Management**: View and edit individual weeks through `TourFolderView`

**Technical Notes**: 
- Modal state transitions are managed by `currentStep` in `TourManager`
- Cast selection data persists between modal transitions via React state
- WeekSetupModal requires `selectedCast` prop to render properly

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

## Recent Critical Fixes (January 2025)

### Algorithm Fairness Overhaul (v3.1)
- **Issue**: Only 11 out of 12 performers were getting RED days, with SEAN being the main victim
- **Root Cause**: Flawed `assignRedDays` method only assigned RED days to performers with natural full days off
- **Solution**: Complete algorithm rewrite with forced RED day creation for all performers
- **Files Fixed**: 
  - `backend/scheduler/algorithm.ts` - Complete RED day assignment logic overhaul
  - `backend/scheduler/algorithm.test.ts` - Comprehensive test suite with 356 assertions
- **Impact**: Perfect fairness - all 12 performers now guaranteed exactly one RED day per week
- **Status**: ✅ Live in production, fully tested and verified

## Previous Critical Fixes (December 2024)

### Authentication System Overhaul
- **Issue**: Missing auth module imports causing backend compilation failures
- **Files Fixed**: 
  - `backend/scheduler/create.ts` - Removed `import { auth } from "../auth/auth";` and disabled auth
  - `backend/scheduler/list.ts` - Removed auth dependencies and user filtering
- **Impact**: Restored backend compilation and API functionality
- **Status**: Superseded — authentication is now enabled, see "Feature Flag Management" below.

### Frontend React Import Fix
- **Issue**: Duplicate `useState` import causing frontend compilation errors
- **File Fixed**: `frontend/components/ScheduleList.tsx` - Consolidated React imports
- **Impact**: Restored delete functionality and component rendering
- **Details**: Fixed from duplicate imports to single `import React, { useState } from 'react';`

### Production Deployment Resolution
- **Issue**: Vercel deployment failing due to compilation errors
- **Solution**: Fixed all blocking compilation issues in both frontend and backend
- **Status**: Application now deploys successfully to production
- **Verification**: Cast members display, schedules show properly, delete operations work

### Feature Flag Management
- **Location**: `backend/config/features.ts`
- **Tours Feature**: Enabled (`MULTI_COUNTRY_TOURS: true`). Override with `ENABLE_TOURS`.
- **Authentication**: Enabled (`AUTHENTICATION_ENABLED: true`).

Authentication uses Encore's native `authHandler` in `backend/auth/encore_auth.ts`,
not custom middleware. Schedule endpoints declare `auth: true` and scope every query
by the caller's `user_id`, so a schedule is only visible to its owner. The old
`backend/auth/middleware.ts` was superseded and removed.

`AUTHENTICATION_ENABLED` is **not** a kill switch that makes endpoints public. The
endpoints hard-declare `auth: true`, and when `isAuthEnabled()` returns false the auth
handler throws `unauthenticated` (`encore_auth.ts:32`). Turning the flag off therefore
makes every schedule endpoint return 401 — it bricks the app rather than opening it.

`isAuthEnabled()` (`auth/config.ts:74`) resolves in this order: the `AUTH_ENABLED`
environment variable if set; then **always true** when `NODE_ENV` is `development` or
unset; then `FEATURE_FLAGS.AUTHENTICATION_ENABLED`. So the feature flag only takes
effect in a non-development `NODE_ENV` with `AUTH_ENABLED` unset.