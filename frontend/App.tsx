import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import ScheduleList from './components/ScheduleList';
import ScheduleEditor from './components/ScheduleEditor';
import CompanyManagement from './components/CompanyManagement';
import { AppHeader } from './components/AppHeader';
import { AuthWrapper } from './components/AuthWrapper';
import { AuthProvider } from './contexts/AuthContext';
import { FEATURE_FLAGS } from '@/config/features';

// Conditionally import TourManager only if feature is enabled
const TourManager = FEATURE_FLAGS.MULTI_COUNTRY_TOURS 
  ? React.lazy(() => import('./components/tours/TourManager'))
  : null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          {FEATURE_FLAGS.AUTHENTICATION_ENABLED ? (
            <AuthWrapper>
              <AppInner />
            </AuthWrapper>
          ) : (
            <AppInner />
          )}
        </Router>
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

function AppInner() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<ScheduleList />} />
          <Route path="/schedule/new" element={<ScheduleEditor />} />
          <Route path="/schedule/:id" element={<ScheduleEditor />} />
          <Route path="/company" element={<CompanyManagement />} />
          {FEATURE_FLAGS.MULTI_COUNTRY_TOURS && TourManager && (
            <Route 
              path="/tours" 
              element={
                <React.Suspense fallback={<div>Loading tours...</div>}>
                  <TourManager />
                </React.Suspense>
              } 
            />
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}