import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { AuthWrapper } from './components/AuthWrapper';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppShell } from '@/components/shell/AppShell';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { ScheduleEditorScreen } from '@/screens/ScheduleEditorScreen';
import { CompanyScreen } from '@/screens/CompanyScreen';
import { ToursScreen } from '@/screens/ToursScreen';
import { ResetPasswordScreen } from '@/screens/ResetPasswordScreen';
import { FEATURE_FLAGS } from '@/config/features';

// NOTE: QueryClientProvider / AuthProvider / ThemeProvider live in main.tsx.
export default function App() {
  return (
    <Router>
      <ErrorBoundary>
        <Routes>
          {/* Public: landing page for emailed reset links — must stay
              reachable without a session, so it sits outside AuthWrapper. */}
          <Route path="/reset-password" element={<ResetPasswordScreen />} />
          <Route
            path="/*"
            element={
              FEATURE_FLAGS.AUTHENTICATION_ENABLED ? (
                <AuthWrapper>
                  <AppRoutes />
                </AuthWrapper>
              ) : (
                <AppRoutes />
              )
            }
          />
        </Routes>
      </ErrorBoundary>
      <Toaster />
    </Router>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardScreen />} />
        <Route path="/schedule/new" element={<ScheduleEditorScreen />} />
        <Route path="/schedule/:id" element={<ScheduleEditorScreen />} />
        <Route path="/company" element={<CompanyScreen />} />
        {FEATURE_FLAGS.MULTI_COUNTRY_TOURS && (
          <Route path="/tours" element={<ToursScreen />} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
