# Changelog

All notable changes to the STOMP Performance Scheduler will be documented in this file.

## [3.2.0] - 2026-07-14

### ✨ Schedule Editor UI Overhaul

Reworks how a week is shaped in the Schedule Editor: the header controls become
focused, pill-anchored popovers, validation reads as a per-performer table, and
the summary stats sit above the grid. No change to the scheduling algorithm.

#### Added
- **Time-cell popovers** (`TimeEditor.tsx`): clicking either the Show or Call time
  cell opens one popover that edits both times, with a **TBC** toggle beside the
  native time picker so an unset time never gets silently invented.
- **Travel / RED status-detail popover** (`StatusDetailEditor.tsx`): the "Travel to"
  city input and the "Company RED day" checkbox move out of the Status header cell
  into a small popover anchored to a trigger beside the status pill. It **auto-opens**
  when a pill is switched to Travel Day / Day Off and reopens from a ✈ / RED-dot icon.
  This keeps the Status row from growing to fit the tallest cell.
- **Structured validation items**: the backend `validate` endpoint now returns
  `items: ValidationItem[]` (rule `code`, `severity`, and where known the
  `performer` / `showId`) alongside `errors`/`warnings`, so the UI can attribute
  every issue without parsing message text.

#### Changed
- **Day-header popover is now Add/Remove only** (`DayEditor.tsx`): times moved to the
  time cells and travel/RED detail moved to the status pill, leaving this popover to
  add a second show, remove a day, or restore an emptied day.
- **Full-width per-performer validation table** (`ViolationBanner.tsx`): validation
  renders as a Performer / Shows / Issues table driven by the new structured `items`,
  replacing the flat warning banner.
- **Summary stat cards moved above the grid** (`ScheduleEditorScreen.tsx`): Shows,
  Roles Filled, RED-day Coverage, and Conflicts now sit above the schedule grid.

#### Technical
- **Full mutual exclusion** across the three header popovers (day / time / status
  detail): opening or changing one always closes the others.
- Regenerated the frontend Encore client (`frontend/client.ts`) for the new
  `items` field and `ValidationItem` type.
- Bumped `encore.dev` `1.50.0` → `1.57.9`.

#### Files Changed
- `frontend/components/domain/schedule-grid/TimeEditor.tsx` - new time popover
- `frontend/components/domain/schedule-grid/StatusDetailEditor.tsx` - new status-detail popover
- `frontend/components/domain/schedule-grid/DayEditor.tsx` - reduced to add/remove
- `frontend/components/domain/schedule-grid/GridHead.tsx` - popover orchestration + status trigger
- `frontend/components/domain/schedule-grid/ViolationBanner.tsx` - per-performer table
- `frontend/screens/ScheduleEditorScreen.tsx` - stat cards above grid
- `frontend/index.css` - popover / trigger / table styling
- `backend/scheduler/validate.ts` - expose structured `items`
- `frontend/client.ts` - regenerated client

---

## [3.1.0] - 2025-01-17

### 🎯 Critical Algorithm Fix: RED Day Fairness

#### Fixed
- **RED Day Fairness Issue**: Resolved critical bug where only 11 out of 12 performers received RED days
- **SEAN Assignment Problem**: Fixed specific case where SEAN and other performers were not getting mandatory RED days
- **Algorithm Logic Flaw**: Replaced flawed `assignRedDays` method with intelligent forced RED day creation

#### Enhanced
- **Smart Day Selection**: Algorithm now prefers weekdays (Tuesday-Friday) for RED day assignments
- **Forced RED Day Creation**: Creates RED days for performers without natural full days off
- **Load Balancing**: Distributes RED days evenly across different weekdays to prevent clustering
- **Weekend Avoidance**: Prevents RED day assignments on weekends when possible

#### Technical Improvements
- **Algorithm Rewrite**: Complete overhaul of RED day assignment logic in `backend/scheduler/algorithm.ts`
- **Helper Methods**: Added `isWeekend()`, `hasBackToBackDoubles()`, and `getBestDayForRedDay()` utilities
- **Comprehensive Testing**: Added 11 new tests with 356 assertions to verify algorithm correctness
- **Performance Optimization**: Improved algorithm efficiency while maintaining all existing constraints

#### Results
- ✅ **Perfect Fairness**: All 12 performers now guaranteed exactly one RED day per week
- ✅ **Weekday Preference**: RED days assigned to Tuesday-Friday (no weekend RED days)
- ✅ **Load Distribution**: RED days spread across different weekdays (e.g., 5 on Tuesday, 3 on Wednesday, 2 on Thursday, 2 on Friday)
- ✅ **Constraint Preservation**: All existing scheduling constraints maintained while improving fairness

#### Files Changed
- `backend/scheduler/algorithm.ts` - Complete algorithm rewrite (143 insertions, 54 deletions)
- `backend/scheduler/algorithm.test.ts` - Comprehensive test suite additions

---

## [3.0.0] - 2025-01-17

### ✨ Major Feature: Tour Bulk Creation System

#### Added
- **Complete Tour Management System**: Create and manage multi-week tour schedules
- **Bulk Schedule Creation**: Generate 1-12 weeks of schedules simultaneously
- **Advanced Cast Selection**: 
  - Select exactly 12 cast members from active roster
  - Archive/activate cast members during selection
  - Quick add new cast members with role restrictions
- **Flexible Week Configuration**:
  - Standard 8-show weeks (Tuesday-Sunday with matinee/evening shows)
  - Custom week schedules with day-by-day show selection
  - Minimum 2 shows per week validation
- **Tour Organization**:
  - Folder-style tour view with expandable segments
  - Individual week management within tours
  - Tour metadata: dates, cast count, show totals
- **Auto-Assignment Integration**: Automatic cast assignments for all tour weeks
- **Navigation Integration**: New "Tours" section in main navigation

#### Backend Changes
- **Database Migration**: Added `tours` table and extended `schedules` table
- **New API Endpoints**:
  - `POST /api/tours/bulk-create` - Create tour with multiple weeks
  - `GET /api/tours` - List all tours with week summaries
  - `DELETE /api/tours/:id` - Delete entire tour and associated weeks
  - `DELETE /api/tours/:tourId/weeks/:weekId` - Delete individual weeks
- **Tour Service**: Complete tour management business logic
- **Type Definitions**: Tour-specific types and interfaces

#### Frontend Changes
- **Tour Components**: 5 new React components for complete workflow
  - `TourManager.tsx` - Main tour management interface
  - `CastSelectionModal.tsx` - Advanced cast selection with archive management
  - `WeekSetupModal.tsx` - Tour and week configuration
  - `TourFolderView.tsx` - Hierarchical tour organization
  - `QuickAddCastModal.tsx` - Rapid cast member addition
- **Navigation Updates**: Tours route and navigation integration
- **Dependencies**: Added `date-fns`, `uuid`, `sonner` for enhanced functionality
- **UI Components**: New AlertDialog and enhanced form components

#### Technical Improvements
- **Parallel Implementation**: Used specialized agents for conflict-free development
- **Type Safety**: Full TypeScript integration with backend API types
- **Error Handling**: Comprehensive validation and user feedback
- **Performance**: Efficient bulk operations with progress tracking
- **Responsive Design**: Mobile-friendly tour management interface

### 🔧 Enhanced Features
- **Schedule Editor**: Individual tour weeks can be edited after bulk creation
- **Company Management**: Improved cast member management with archive functionality
- **API Client**: Regenerated with all new tour endpoints

### 🛠 Technical Debt
- **Database Schema**: Extended existing structure while maintaining backward compatibility
- **Component Architecture**: Modular design for maintainable tour functionality
- **Integration Testing**: Verified compatibility with existing scheduler features

### 📚 Documentation
- **Updated CLAUDE.md**: Added tour system documentation and architecture notes
- **New README.md**: Comprehensive project documentation with tour features
- **Updated File Organization**: Reflected new backend and frontend structure

---

## [2.x.x] - Previous Releases

### Features (Previously Implemented)
- **Core Scheduling**: Individual schedule creation and management
- **Cast Assignment**: Automatic role assignment with constraint validation
- **PDF Export**: Professional STOMP-formatted schedule exports
- **RED Day Tracking**: Consecutive performance day management
- **Company Management**: Cast member and role management
- **Schedule Analytics**: Performance and cast utilization insights
- **Live Updates**: Dynamic week calculations and real-time updates
- **Enhanced UI**: Improved visual design and user experience

### Technical Foundation
- **Backend**: Encore.dev framework with TypeScript
- **Frontend**: React 19 + TypeScript with Vite
- **Database**: PostgreSQL with JSONB storage
- **UI Framework**: TailwindCSS v4 + Radix UI components
- **Package Management**: Bun for fast dependency management
- **Testing**: Vitest unit tests and Playwright E2E tests

---

## Migration Guide

### From v2.x to v3.0

#### Database
- Run database migration automatically handled by Encore
- Existing schedules remain fully compatible
- New tour features available immediately

#### API
- All existing endpoints remain unchanged
- New tour endpoints are additive
- Frontend client auto-regenerated with new methods

#### UI
- New "Tours" navigation item added
- All existing functionality preserved
- Tour features accessible via `/tours` route

#### Workflow
- Individual schedule creation unchanged
- New bulk tour creation workflow available
- Both workflows can be used simultaneously

---

## Future Roadmap

### Planned Features
- **Tour Templates**: Save and reuse common tour configurations
- **Advanced Analytics**: Cross-tour performance metrics
- **Export Enhancements**: Tour-level PDF exports and reporting
- **Collaboration**: Multi-user tour planning and approval workflows
- **Integration**: External calendar and venue management systems

### Technical Improvements
- **Performance Optimization**: Enhanced bulk operation performance
- **Mobile App**: Native mobile application for tour management
- **API Versioning**: Structured API versioning for future updates
- **Testing Coverage**: Expanded E2E test coverage for tour workflows