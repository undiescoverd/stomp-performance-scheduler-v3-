# STOMP Performance Scheduler v3

A comprehensive full-stack application for managing theatrical performance schedules with multi-week tour support.

## 🎭 Features

### Core Scheduling
- **Schedule Management**: Create and edit performance schedules with cast assignments
- **Role Assignment**: Automatic cast assignment with constraint validation
- **RED Day Tracking**: Track consecutive performance days for cast wellness
- **Performance Analytics**: View schedule analytics and cast utilization

### Tour Bulk Creation System ✨ NEW
- **Multi-Week Tours**: Create 1-12 weeks of schedules simultaneously
- **Cast Selection**: Select exactly 12 cast members with archive management
- **Flexible Scheduling**: Standard 8-show weeks or custom day-by-day configuration
- **Auto-Assignment**: Automatic cast assignments for all tour weeks
- **Tour Organization**: Folder-style tour management with individual week editing
- **Quick Add Cast**: Add new cast members during tour creation

### Professional Features
- **PDF Export**: STOMP-formatted PDF schedules with professional layout
- **Company Management**: Manage cast members, roles, and eligibility
- **Live Updates**: Dynamic week calculations and real-time schedule updates
- **Comprehensive Validation**: Constraint checking and schedule optimization

## 🏗 Architecture

- **Backend**: Encore.dev framework with TypeScript services
- **Frontend**: React 19 + TypeScript with Vite
- **Database**: PostgreSQL with JSONB for flexible data storage
- **UI**: TailwindCSS v4 + Radix UI components
- **Package Management**: Bun for fast dependency management

## 🚀 Quick Start

### Prerequisites
- [Encore CLI](https://encore.dev/docs/install) installed
- [Bun](https://bun.sh) package manager
- PostgreSQL database (automatically managed by Encore)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/undiescoverd/stomp-performance-scheduler-v3.git
   cd stomp-performance-scheduler-v3
   ```

2. **Start the backend**
   ```bash
   cd backend
   encore run
   ```
   Backend available at `http://localhost:4000`

3. **Start the frontend** (in new terminal)
   ```bash
   cd frontend
   bun install
   bun run dev
   ```
   Frontend available at `http://localhost:5173`

4. **Generate API client** (after backend changes)
   ```bash
   cd backend
   encore gen client --target leap
   ```

## 📖 User Guide

### Main Navigation
- **Home** (`/`): Schedule list and overview
- **Tours** (`/tours`): Multi-week tour management ✨
- **Company** (`/company`): Cast member management
- **Schedule Editor** (`/schedule/:id`): Individual schedule editing

### Tour Creation Workflow
1. Navigate to **Tours** → **Create New Tour Segment**
2. **Cast Selection**: Choose exactly 12 cast members
3. **Week Configuration**: Set tour name, dates, and week types
4. **Bulk Generation**: Create all weeks with auto-assignments
5. **Management**: View, edit, or delete individual weeks

### Schedule Features
- **8 Roles**: Sarge, Potato, Mozzie, Ringo, Particle, Bin, Cornish, Who
- **Gender Constraints**: Bin and Cornish are female-only roles
- **RED Day Management**: Automatic tracking of consecutive show days
- **Assignment Validation**: Real-time constraint checking

## 🛠 Development

### File Structure
```
├── backend/
│   ├── scheduler/           # Core scheduling service
│   │   ├── tours.ts        # Tour bulk creation API ✨
│   │   ├── tour_types.ts   # Tour type definitions ✨
│   │   ├── migrations/     # Database migrations ✨
│   │   └── *.ts           # Other API endpoints
│   └── frontend/          # Built frontend assets
├── frontend/
│   ├── components/
│   │   ├── tours/         # Tour management components ✨
│   │   └── ui/           # Reusable UI components
│   └── utils/            # Utility functions
```

### API Endpoints

#### Tours ✨
- `POST /api/tours/bulk-create` - Create tour with multiple weeks
- `GET /api/tours` - List all tours with weeks
- `DELETE /api/tours/:id` - Delete entire tour
- `DELETE /api/tours/:tourId/weeks/:weekId` - Delete specific week

#### Schedules
- `POST /api/scheduler/create` - Create individual schedule
- `GET /api/scheduler/list` - List all schedules
- `POST /api/scheduler/auto_generate` - Auto-generate assignments
- `POST /api/scheduler/validate` - Validate schedule constraints

### Testing
```bash
# Unit tests
cd frontend && vitest

# E2E tests (requires both servers running)
cd frontend && npx playwright test

# Build verification
cd backend && bun run build
```

## 🎯 Recent Updates

### v3.0 - Tour Bulk Creation System
- ✅ Complete multi-week tour management
- ✅ Bulk schedule creation (1-12 weeks)
- ✅ Advanced cast selection with archive management
- ✅ Flexible week configuration (standard/custom)
- ✅ Folder-style tour organization
- ✅ Individual week editing after bulk creation

### Previous Features
- Professional PDF export with STOMP formatting
- Live week number calculations
- Algorithm determinism improvements
- Enhanced UI/UX with better visual design
- Comprehensive constraint validation

## 📋 Domain Model

- **Cast Members**: 12 performers with role eligibility
- **Roles**: 8 performance roles with gender restrictions
- **Shows**: Individual performances (show/travel/dayoff status)
- **Assignments**: Role assignments per show with RED day tracking
- **Schedules**: Complete weekly scheduling containers
- **Tours**: Multi-week scheduling containers with bulk creation ✨

## 🔧 Technical Details

- **Database**: PostgreSQL with JSONB for flexible show/assignment storage
- **State Management**: React Query with 5-minute cache and 1 retry
- **Styling**: TailwindCSS v4 with custom design tokens
- **Type Safety**: Full TypeScript coverage with auto-generated API types
- **Validation**: Client-side and server-side constraint validation

## 📦 Dependencies

### Backend
- Encore.dev framework
- TypeScript
- PostgreSQL
- UUID generation

### Frontend
- React 19 + TypeScript
- TanStack Query (React Query)
- React Router v7
- Radix UI components
- TailwindCSS v4
- date-fns, sonner (toast notifications)

## 🚀 Deployment

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed deployment instructions including:
- Encore Cloud Platform deployment
- GitHub integration
- Self-hosting with Docker
- Environment configuration

## 📄 License

Proprietary software for STOMP theatrical organization.

## 🤝 Contributing

This is a private project for STOMP. For support or questions, please contact the development team.

---

**Built with ❤️ for STOMP theatrical performances**