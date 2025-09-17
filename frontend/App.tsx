import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import ScheduleList from './components/ScheduleList';
import ScheduleEditor from './components/ScheduleEditor';
import CompanyManagement from './components/CompanyManagement';
import TourManager from './components/tours/TourManager';
import { AppHeader } from './components/AppHeader';

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
      <Router>
        <AppInner />
      </Router>
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
          <Route path="/tours" element={<TourManager />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}