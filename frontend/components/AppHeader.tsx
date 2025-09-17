import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, Home, Plus, Users, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AppHeader() {
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const isEditPage = location.pathname.includes('/schedule/');
  const isCompanyPage = location.pathname === '/company';
  const isToursPage = location.pathname === '/tours';

  // Determine page title based on route
  const getPageTitle = () => {
    if (location.pathname === '/schedule/new') {
      return 'New Schedule';
    } else if (location.pathname.includes('/schedule/')) {
      return 'Edit Schedule';
    } else if (location.pathname === '/company') {
      return 'Company Management';
    } else if (location.pathname === '/tours') {
      return 'Tour Manager';
    }
    return 'STOMP Scheduler';
  };

  const getPageSubtitle = () => {
    if (isEditPage) {
      return 'Performance Cast Management';
    } else if (isCompanyPage) {
      return 'Manage Cast Members & Roles';
    } else if (isToursPage) {
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
            
            {!isToursPage && (
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
          </div>
        </div>
      </div>
    </header>
  );
}