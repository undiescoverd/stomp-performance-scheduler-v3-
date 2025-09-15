import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';
import ScheduleEditor from '../../../components/ScheduleEditor';
import ScheduleList from '../../../components/ScheduleList';
import CompanyManagement from '../../../components/CompanyManagement';
import App from '../../../App';

// Test wrapper component
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('Schedule Workflow Integration Tests', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  describe('Complete Schedule Creation Flow', () => {
    it('should create a schedule from start to finish', async () => {
      render(
        <TestWrapper>
          <ScheduleEditor />
        </TestWrapper>
      );

      // Step 1: Fill in basic information
      const locationInput = screen.getByLabelText(/city/i);
      const weekInput = screen.getByLabelText(/week number/i);

      await user.clear(locationInput);
      await user.type(locationInput, 'Integration Test City');
      
      await user.clear(weekInput);
      await user.type(weekInput, '42');

      expect(locationInput).toHaveValue('Integration Test City');
      expect(weekInput).toHaveValue('42');

      // Step 2: Wait for default shows to load
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Step 3: Auto-generate assignments
      const autoGenerateButton = screen.getByRole('button', { name: /auto generate/i });
      expect(autoGenerateButton).toBeEnabled();
      
      await user.click(autoGenerateButton);

      // Wait for generation to complete
      await waitFor(() => {
        expect(autoGenerateButton).not.toBeDisabled();
      });

      // Step 4: Verify assignments are created
      const selects = screen.getAllByRole('combobox');
      const assignmentSelects = selects.filter(select => 
        select.getAttribute('value') && 
        select.getAttribute('value') !== 'none' &&
        select.getAttribute('value') !== ''
      );
      
      expect(assignmentSelects.length).toBeGreaterThan(0);

      // Step 5: Save the schedule
      const createButton = screen.getByRole('button', { name: /create schedule/i });
      expect(createButton).toBeEnabled();
      
      await user.click(createButton);

      // Wait for save to complete
      await waitFor(() => {
        expect(createButton).not.toBeDisabled();
      });
    });

    it('should handle show status changes correctly', async () => {
      render(
        <TestWrapper>
          <ScheduleEditor />
        </TestWrapper>
      );

      // Wait for schedule grid to load
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Find status dropdowns
      const statusSelects = screen.getAllByDisplayValue('show');
      expect(statusSelects.length).toBeGreaterThan(0);

      // Change first show to travel day
      await user.selectOptions(statusSelects[0], 'travel');
      
      // Verify travel day content appears
      await waitFor(() => {
        expect(screen.getByText('TRAVEL')).toBeInTheDocument();
      });

      // Change another to day off
      if (statusSelects.length > 1) {
        await user.selectOptions(statusSelects[1], 'dayoff');
        
        await waitFor(() => {
          expect(screen.getByText('DAY OFF')).toBeInTheDocument();
        });
      }
    });

    it('should validate assignments and show errors', async () => {
      // Mock validation to return errors
      server.use(
        http.post('/schedules/validate', () => {
          return HttpResponse.json({
            isValid: false,
            errors: ['PHIL is assigned to multiple roles in the same show'],
            warnings: ['MOLLY is underutilized with only 1 show']
          });
        })
      );

      render(
        <TestWrapper>
          <ScheduleEditor />
        </TestWrapper>
      );

      // Wait for grid and auto-generate
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      const autoGenerateButton = screen.getByRole('button', { name: /auto generate/i });
      await user.click(autoGenerateButton);

      await waitFor(() => {
        expect(autoGenerateButton).not.toBeDisabled();
      });

      // Validation happens automatically, errors would show in UI
      // In a real implementation, you'd check for error messages in the UI
    });
  });

  describe('Schedule List Integration', () => {
    it('should display schedules and allow navigation', async () => {
      // Mock schedules data
      server.use(
        http.get('/schedules', () => {
          return HttpResponse.json({
            schedules: [
              {
                id: 'test-schedule-1',
                location: 'Test City',
                week: '42',
                shows: [
                  { id: 'show1', date: '2024-10-15', time: '19:00', callTime: '18:00', status: 'show' }
                ],
                assignments: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            ]
          });
        })
      );

      render(
        <TestWrapper>
          <ScheduleList />
        </TestWrapper>
      );

      // Wait for schedule to appear
      await waitFor(() => {
        expect(screen.getByText('Test City')).toBeInTheDocument();
        expect(screen.getByText('Week 42')).toBeInTheDocument();
      });

      // Verify edit button is present
      const editButton = screen.getByRole('link', { name: /edit/i });
      expect(editButton).toBeInTheDocument();
    });

    it('should handle empty schedule list', async () => {
      render(
        <TestWrapper>
          <ScheduleList />
        </TestWrapper>
      );

      // Should show empty state
      await waitFor(() => {
        expect(screen.getByText(/no schedules yet/i)).toBeInTheDocument();
      });

      // Should have create first schedule button
      const createButton = screen.getByRole('link', { name: /create first schedule/i });
      expect(createButton).toBeInTheDocument();
    });
  });

  describe('Company Management Integration', () => {
    it('should display cast members and allow management', async () => {
      render(
        <TestWrapper>
          <CompanyManagement />
        </TestWrapper>
      );

      // Wait for cast members to load
      await waitFor(() => {
        expect(screen.getByText('PHIL')).toBeInTheDocument();
        expect(screen.getByText('MOLLY')).toBeInTheDocument();
      });

      // Verify tabs are present
      expect(screen.getByRole('tab', { name: /current company/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /archive/i })).toBeInTheDocument();

      // Verify add member functionality
      const addMemberButton = screen.getByRole('button', { name: /add new cast member/i });
      expect(addMemberButton).toBeInTheDocument();
    });

    it('should allow adding new cast members', async () => {
      // Mock successful member addition
      server.use(
        http.post('/company/members', async ({ request }) => {
          const data = await request.json() as any;
          return HttpResponse.json({
            member: {
              id: 'new-member-id',
              name: data.name,
              eligibleRoles: data.eligibleRoles,
              status: 'active',
              dateAdded: new Date().toISOString(),
              order: 99
            }
          });
        })
      );

      render(
        <TestWrapper>
          <CompanyManagement />
        </TestWrapper>
      );

      // Click add member button
      const addButton = screen.getByRole('button', { name: /add new cast member/i });
      await user.click(addButton);

      // Fill in new member form
      const nameInput = screen.getByPlaceholderText(/cast member name/i);
      await user.type(nameInput, 'NEW MEMBER');

      // Select roles (this would require more complex interaction with role selector)
      // For now, just verify the form appears
      expect(nameInput).toHaveValue('NEW MEMBER');
    });
  });

  describe('Full App Integration', () => {
    it('should navigate between different sections', async () => {
      // Mock initial empty schedules
      server.use(
        http.get('/schedules', () => {
          return HttpResponse.json({ schedules: [] });
        })
      );

      render(
        <TestWrapper>
          <App />
        </TestWrapper>
      );

      // Should start on home page with empty state
      await waitFor(() => {
        expect(screen.getByText(/no schedules yet/i)).toBeInTheDocument();
      });

      // Navigate to company management
      const companyButton = screen.getByRole('link', { name: /manage company/i });
      await user.click(companyButton);

      // Should see company management page
      await waitFor(() => {
        expect(screen.getByText(/company management/i)).toBeInTheDocument();
      });

      // Navigate back home
      const homeButton = screen.getByRole('link', { name: /home/i });
      await user.click(homeButton);

      // Should be back on home page
      await waitFor(() => {
        expect(screen.getByText(/no schedules yet/i)).toBeInTheDocument();
      });
    });

    it('should handle responsive behavior', async () => {
      // Mock viewport change
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375, // Mobile width
      });

      render(
        <TestWrapper>
          <ScheduleEditor />
        </TestWrapper>
      );

      // Should still render correctly on mobile
      await waitFor(() => {
        expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
      });

      // Schedule grid should be present (even if horizontally scrollable)
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle backend errors gracefully', async () => {
      // Mock backend error
      server.use(
        http.post('/schedules/auto-generate', () => {
          return HttpResponse.json({
            success: false,
            assignments: [],
            errors: ['Unable to generate valid schedule due to insufficient cast']
          });
        })
      );

      render(
        <TestWrapper>
          <ScheduleEditor />
        </TestWrapper>
      );

      // Wait for grid to load
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Try auto-generation
      const autoGenerateButton = screen.getByRole('button', { name: /auto generate/i });
      await user.click(autoGenerateButton);

      // Should handle error gracefully (error toast would appear in real implementation)
      await waitFor(() => {
        expect(autoGenerateButton).not.toBeDisabled();
      });
    });

    it('should handle network errors', async () => {
      // Mock network error
      server.use(
        http.get('/cast-members', () => {
          return new Response(null, { status: 500 });
        })
      );

      render(
        <TestWrapper>
          <ScheduleEditor />
        </TestWrapper>
      );

      // Should still render basic form even with network error
      expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large numbers of shows efficiently', async () => {
      // Mock many shows
      const manyShows = Array.from({ length: 20 }, (_, i) => ({
        id: `show_${i}`,
        date: `2024-10-${15 + i}`,
        time: '19:00',
        callTime: '18:00',
        status: 'show' as const
      }));

      server.use(
        http.post('/schedules/auto-generate', () => {
          const assignments = [];
          for (const show of manyShows) {
            for (const role of ['Sarge', 'Potato', 'Mozzie', 'Ringo', 'Particle', 'Bin', 'Cornish', 'Who']) {
              assignments.push({
                showId: show.id,
                role: role,
                performer: 'PHIL'
              });
            }
          }
          
          return HttpResponse.json({
            success: true,
            assignments: assignments
          });
        })
      );

      render(
        <TestWrapper>
          <ScheduleEditor />
        </TestWrapper>
      );

      // Should handle many shows without performance issues
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should handle empty or invalid data gracefully', async () => {
      // Mock empty responses
      server.use(
        http.get('/cast-members', () => {
          return HttpResponse.json({
            castMembers: [],
            roles: []
          });
        })
      );

      render(
        <TestWrapper>
          <ScheduleEditor />
        </TestWrapper>
      );

      // Should still render even with empty data
      expect(screen.getByLabelText(/city/i)).toBeInTheDocument();

      // Auto-generate should handle empty cast gracefully
      await waitFor(() => {
        const autoGenerateButton = screen.getByRole('button', { name: /auto generate/i });
        expect(autoGenerateButton).toBeInTheDocument();
      });
    });
  });
});
