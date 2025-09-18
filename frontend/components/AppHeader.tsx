import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, Home, Plus, Users, Map, User, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import { FEATURE_FLAGS } from '@/config/features';

// Component for when authentication is enabled
function AppHeaderWithAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  return <AppHeaderContent location={location} user={user} isLoaded={!isLoading} />;
}

// Component for when authentication is disabled
function AppHeaderWithoutAuth() {
  const location = useLocation();
  return <AppHeaderContent location={location} user={null} isLoaded={true} />;
}

// User menu component
function UserMenu({ user }: { user: any }) {
  const { logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md px-2 py-1"
      >
        <User className="h-5 w-5" />
        <span className="text-sm">
          {user?.firstName || user?.email || 'User'}
        </span>
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10">
          <div className="py-1">
            <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
              {user?.email}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared content component
function AppHeaderContent({ location, user, isLoaded }: { location: any, user: any, isLoaded: boolean }) {
  const isHomePage = location.pathname === '/';
  const isEditPage = location.pathname.includes('/schedule/');
  const isCompanyPage = location.pathname === '/company';
  const isToursPage = FEATURE_FLAGS.MULTI_COUNTRY_TOURS && location.pathname === '/tours';

  // Determine page title based on route
  const getPageTitle = () => {
    if (location.pathname === '/schedule/new') {
      return 'New Schedule';
    } else if (location.pathname.includes('/schedule/')) {
      return 'Edit Schedule';
    } else if (location.pathname === '/company') {
      return 'Company Management';
    } else if (FEATURE_FLAGS.MULTI_COUNTRY_TOURS && location.pathname === '/tours') {
      return 'Tour Manager';
    }
    return 'STOMP Scheduler';
  };

  const getPageSubtitle = () => {
    if (isEditPage) {
      return 'Performance Cast Management';
    } else if (isCompanyPage) {
      return 'Manage Cast Members & Roles';
    } else if (FEATURE_FLAGS.MULTI_COUNTRY_TOURS && isToursPage) {
      return 'Multi-Week Tour Management';
    }
    return 'Performance Cast Management';
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <Calendar className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{getPageTitle()}</h1>
              <p className="text-sm text-gray-600">{getPageSubtitle()}</p>
            </div>
          </Link>
          
          <div className="flex items-center space-x-4">
            {!isHomePage && (
              <Button variant="outline" asChild>
                <Link to="/" className="flex items-center space-x-2">
                  <Home className="h-4 w-4" />
                  <span>Home</span>
                </Link>
              </Button>
            )}
            
            {!isCompanyPage && (
              <Button variant="outline" asChild>
                <Link to="/company" className="flex items-center space-x-2">
                  <Users className="h-4 w-4" />
                  <span>Manage Company</span>
                </Link>
              </Button>
            )}
            
            {FEATURE_FLAGS.MULTI_COUNTRY_TOURS && !isToursPage && (
              <Button variant="outline" asChild>
                <Link to="/tours" className="flex items-center space-x-2">
                  <Map className="h-4 w-4" />
                  <span>Tours</span>
                </Link>
              </Button>
            )}
            
            {(isHomePage || isCompanyPage || isToursPage) && (
              <Button asChild>
                <Link to="/schedule/new" className="flex items-center space-x-2">
                  <Plus className="h-4 w-4" />
                  <span>New Schedule</span>
                </Link>
              </Button>
            )}
            
            {/* User section - only show if authentication is enabled */}
            {FEATURE_FLAGS.AUTHENTICATION_ENABLED && (
              <div className="flex items-center gap-4 ml-4 pl-4 border-l border-gray-200">
                {isLoaded && user && (
                  <UserMenu user={user} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

// Main export component that chooses between auth and non-auth versions
export function AppHeader() {
  return FEATURE_FLAGS.AUTHENTICATION_ENABLED ? <AppHeaderWithAuth /> : <AppHeaderWithoutAuth />;
}