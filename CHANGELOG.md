# Changelog

All notable changes to the STOMP Performance Scheduler will be documented in this file.

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