import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import backend from '~backend/client';
import type { Show, Assignment, Role, DayStatus } from '~backend/scheduler/types';
import { useToast } from '@/components/ui/use-toast';
import { isoDate } from '@/components/domain/format';
import {
  addShowToDate,
  nextShow,
  resetShowTimes,
  setDestination,
  sortShows,
  timeIsFree,
} from '@/components/domain/week';

export function useScheduleEditor(id?: string) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [location, setLocation] = useState('');
  const [week, setWeek] = useState('');
  const [weekStartDate, setWeekStartDate] = useState('');
  const [shows, setShows] = useState<Show[]>([]);
  /**
   * The week as it arrived (loaded from the backend, or the standard seed for a
   * new schedule). "Add Show" restores slots from this, so removing a day is
   * undoable even though the grid has no editable date or time field. It is not
   * the standard week: a tour week that arrives Mon-Sat restores as Mon-Sat.
   */
  const baselineShows = useRef<Show[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const isEditing = Boolean(id);

  // Fetch existing schedule if editing
  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ['schedule', id],
    queryFn: () => backend.scheduler.get({ id: id! }),
    enabled: isEditing
  });

  // Fetch cast members and roles
  const { data: castData } = useQuery({
    queryKey: ['cast-members'],
    queryFn: () => backend.scheduler.getCastMembers(),
    refetchInterval: 60000, // Auto-refresh every 60 seconds
    refetchIntervalInBackground: false // Don't refresh when tab is not focused to save resources
  });

  // Create schedule mutation
  const createMutation = useMutation({
    mutationFn: (data: { location: string; week: string; shows: Show[] }) =>
      backend.scheduler.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      navigate(`/schedule/${response.schedule.id}`);
      toast({
        title: "Success",
        description: "Schedule created successfully"
      });
    },
    onError: (error) => {
      console.error('Failed to create schedule:', error);
      toast({
        title: "Error",
        description: "Failed to create schedule",
        variant: "destructive"
      });
    }
  });

  // Update schedule mutation
  const updateMutation = useMutation({
    mutationFn: (data: { id: string; location?: string; week?: string; shows?: Show[]; assignments?: Assignment[] }) =>
      backend.scheduler.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['schedule', id] });
      toast({
        title: "Success",
        description: "Schedule saved successfully"
      });
    },
    onError: (error) => {
      console.error('Failed to update schedule:', error);
      toast({
        title: "Error",
        description: "Failed to save schedule",
        variant: "destructive"
      });
    }
  });

  // Auto-generate mutation
  const autoGenerateMutation = useMutation({
    mutationFn: (shows: Show[]) => backend.scheduler.autoGenerate({ shows }),
    gcTime: 0, // Don't cache auto-generate results
    retry: false, // Don't retry auto-generate failures
    onSuccess: (response) => {
      if (response.success) {
        setAssignments(response.assignments);

        // Check for critical violations in the response
        const stageAssignments = response.assignments.filter(a => a.role !== "OFF");
        const performerShowCounts = new Map<string, number>();

        // Quick check for consecutive shows or overwork
        stageAssignments.forEach(assignment => {
          const count = performerShowCounts.get(assignment.performer) || 0;
          performerShowCounts.set(assignment.performer, count + 1);
        });

        const maxShows = Math.max(...Array.from(performerShowCounts.values()));
        if (maxShows > 6) {
          toast({
            title: "Warning",
            description: `Schedule generated but some performers may be overworked (${maxShows} shows max)`,
            variant: "destructive"
          });
        } else {
          const genInfo = response.generationId ? ` (ID: ${response.generationId.substring(0, 8)})` : '';
          toast({
            title: "Success",
            description: `Schedule generated successfully with improved constraints${genInfo}`
          });
        }
      } else {
        toast({
          title: "Generation Failed",
          description: response.errors?.[0] || "Could not generate a valid schedule",
          variant: "destructive"
        });
      }
    },
    onError: (error) => {
      console.error('Failed to generate schedule:', error);
      toast({
        title: "Error",
        description: "Failed to generate schedule",
        variant: "destructive"
      });
    },
    onSettled: () => {
      setIsGenerating(false);
    }
  });

  // Helper function to get next Monday
  const getNextMonday = (fromDate = new Date()): Date => {
    const date = new Date(fromDate);
    const day = date.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day; // 0 = Sunday
    if (day === 1) { // If it's already Monday
      return date;
    }
    date.setDate(date.getDate() + daysUntilMonday);
    return date;
  };

  // Helper function to calculate week number from date
  const getWeekNumberFromDate = (date: Date): number => {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  };

  // Helper function to format date for input
  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  // Helper function to generate shows from week start date
  const generateShowsFromWeekStart = (weekStartDate: string): Show[] => {
    const startDate = new Date(weekStartDate);
    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

    const defaultShows: Show[] = [
      // Tuesday - 8pm Show, 5pm Call
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 1 * 24 * 60 * 60 * 1000)), time: '20:00', callTime: '17:00', status: 'show' },
      // Wednesday - 8pm Show, 6pm Call
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000)), time: '20:00', callTime: '18:00', status: 'show' },
      // Thursday - 8pm Show, 6pm Call
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000)), time: '20:00', callTime: '18:00', status: 'show' },
      // Friday - 8pm Show, 6pm Call
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 4 * 24 * 60 * 60 * 1000)), time: '20:00', callTime: '18:00', status: 'show' },
      // Saturday matinee - 3pm Show
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000)), time: '15:00', callTime: '13:30', status: 'show' },
      // Saturday evening - 8pm Show
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000)), time: '20:00', callTime: '18:00', status: 'show' },
      // Sunday matinee - 3pm Show
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)), time: '15:00', callTime: '13:30', status: 'show' },
      // Sunday evening - 6pm Show
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)), time: '18:00', callTime: '16:30', status: 'show' }
    ];

    return defaultShows;
  };

  // Handle week start date change
  const handleWeekStartDateChange = (newDate: string) => {
    setWeekStartDate(newDate);

    // Auto-calculate week number
    const date = new Date(newDate);
    const weekNumber = getWeekNumberFromDate(date);
    setWeek(weekNumber.toString());

    // Update existing shows dates if we have shows
    if (shows.length > 0) {
      const startDate = new Date(newDate);
      const updatedShows = shows.map((show, index) => {
        // Calculate new date based on show's position in the week
        const originalDate = new Date(show.date);
        const originalWeekStart = new Date(weekStartDate);
        const dayOffset = Math.floor((originalDate.getTime() - originalWeekStart.getTime()) / (24 * 60 * 60 * 1000));

        // If we can't calculate offset (first time setting date), use index-based approach
        const finalDayOffset = isNaN(dayOffset) ? (index < 4 ? index + 1 : index - 3) : dayOffset;

        const newDate = new Date(startDate.getTime() + finalDayOffset * 24 * 60 * 60 * 1000);

        return {
          ...show,
          date: formatDateForInput(newDate)
        };
      });
      setShows(updatedShows);
    }
  };

  // Navigate to previous week
  const navigateToPreviousWeek = () => {
    const currentDate = new Date(weekStartDate);
    const previousWeek = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    handleWeekStartDateChange(formatDateForInput(previousWeek));
  };

  // Navigate to next week
  const navigateToNextWeek = () => {
    const currentDate = new Date(weekStartDate);
    const nextWeek = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    handleWeekStartDateChange(formatDateForInput(nextWeek));
  };

  // Navigate to current week
  const navigateToCurrentWeek = () => {
    const nextMonday = getNextMonday();
    handleWeekStartDateChange(formatDateForInput(nextMonday));
  };

  // Load schedule data when editing
  useEffect(() => {
    if (scheduleData?.schedule) {
      const schedule = scheduleData.schedule;
      setLocation(schedule.location);
      setWeek(schedule.week);
      // The generated client's dateReviver turns show.date into a Date; if we
      // send that straight back the client re-serializes it as a full ISO
      // datetime ("...T00:00:00.000Z"), which breaks the backend's YYYY-MM-DD
      // date rules (auto-gen avoidance AND validation). Normalize to plain
      // calendar-date strings on load so every outgoing payload stays clean.
      const loaded = schedule.shows.map((s) => ({ ...s, date: isoDate(s.date) }));
      setShows(loaded);
      baselineShows.current = loaded;
      setAssignments(schedule.assignments);

      // Calculate week start date from first show (guard against malformed
      // dates so a bad schedule can't crash the editor).
      if (schedule.shows.length > 0) {
        const firstShowDate = new Date(isoDate(schedule.shows[0].date));
        if (!Number.isNaN(firstShowDate.getTime())) {
          const dayOfWeek = firstShowDate.getDay();
          const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, so 6 days from Monday
          const mondayDate = new Date(firstShowDate.getTime() - daysFromMonday * 24 * 60 * 60 * 1000);
          setWeekStartDate(formatDateForInput(mondayDate));
        }
      }
    }
  }, [scheduleData]);

  // Initialize default values for new schedule
  useEffect(() => {
    if (!isEditing) {
      const nextMonday = getNextMonday();
      const weekNumber = getWeekNumberFromDate(nextMonday);

      setWeek(weekNumber.toString());
      setLocation('London');
      setWeekStartDate(formatDateForInput(nextMonday));

      // Generate default shows
      const defaultShows = generateShowsFromWeekStart(formatDateForInput(nextMonday));
      setShows(defaultShows);
      baselineShows.current = defaultShows;
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (!location.trim() || !week.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in city and week",
        variant: "destructive"
      });
      return;
    }

    if (shows.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one show",
        variant: "destructive"
      });
      return;
    }

    try {
      if (isEditing && id) {
        await updateMutation.mutateAsync({
          id,
          location,
          week,
          shows,
          assignments
        });
      } else {
        await createMutation.mutateAsync({
          location,
          week,
          shows
        });
      }
    } catch (error) {
      // Error handling is done in mutation onError
    }
  };

  const handleAutoGenerate = async () => {
    const activeShows = shows.filter(show => show.status === 'show');
    if (activeShows.length === 0) {
      toast({
        title: "No Active Shows",
        description: "Please add shows with 'Show Day' status before generating assignments",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    try {
      await autoGenerateMutation.mutateAsync(shows);
    } catch (error) {
      // Error handling is done in mutation onError
    }
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all assignments?')) {
      setAssignments([]);
      toast({
        title: "Cleared",
        description: "All assignments have been cleared"
      });
    }
  };

  const handleAssignmentChange = (showId: string, role: Role, performer: string) => {
    setAssignments(prev => {
      // Remove existing assignment for this show/role
      let next = prev.filter(a => !(a.showId === showId && a.role === role));

      // Add new assignment if performer is selected
      if (performer) {
        next.push({ showId, role, performer });
        // A performer given a role can't also be on a RED day that same date.
        const date = isoDate(shows.find(s => s.id === showId)?.date ?? '');
        next = next.filter(a => !(a.performer === performer && a.isRedDay &&
          isoDate(shows.find(s => s.id === a.showId)?.date ?? '') === date));
      }

      return next;
    });
  };

  // Toggle a performer's RED day for a given calendar date. Enforces the design
  // rules: one RED day per week, and RED blocked while the performer holds a role
  // that day. (Date is a normalized "YYYY-MM-DD" key — see isoDate.)
  const handleToggleRedDay = (date: string, performer: string) => {
    const showIdsThatDay = shows
      .filter(s => isoDate(s.date) === date && s.status === 'show')
      .map(s => s.id);
    if (showIdsThatDay.length === 0) return;

    const hasRole = assignments.some(
      a => showIdsThatDay.includes(a.showId) && a.performer === performer && a.role !== 'OFF',
    );
    if (hasRole) {
      toast({
        title: 'RED day blocked',
        description: `${performer} is assigned a role on ${date}. Remove the role first.`,
        variant: 'destructive',
      });
      return;
    }

    setAssignments(prev => {
      const alreadyRed = prev.some(
        a => a.performer === performer && a.isRedDay && showIdsThatDay.includes(a.showId),
      );
      if (alreadyRed) {
        return prev.filter(
          a => !(a.performer === performer && a.isRedDay && showIdsThatDay.includes(a.showId)),
        );
      }
      // one RED per week: clear any existing RED for this performer first
      const cleared = prev.filter(a => !(a.performer === performer && a.isRedDay));
      cleared.push({ showId: showIdsThatDay[0], role: 'OFF', performer, isRedDay: true });
      return cleared;
    });
  };

  // RD injury/sickness override: flag/unflag all of a performer's stage
  // assignments so the backend downgrades their back-to-back / weekly-cap
  // fatigue violation to a warning. Never touches OFF/RED assignments.
  const handleToggleOverride = (performer: string) => {
    setAssignments(prev => {
      const stage = prev.filter(a => a.performer === performer && a.role !== 'OFF');
      const nextValue = !stage.some(a => a.isOverride);
      return prev.map(a =>
        a.performer === performer && a.role !== 'OFF' ? { ...a, isOverride: nextValue } : a,
      );
    });
  };

  const handleShowStatusChange = (showId: string, status: DayStatus) => {
    setShows(prev => prev.map(show =>
      show.id === showId ? { ...show, status } : show
    ));

    // Clear assignments for this show if it's no longer a show day
    if (status !== 'show') {
      setAssignments(prev => prev.filter(a => a.showId !== showId));
    }
  };

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

  /**
   * Edit a show's date or times. Never touches `show.id`: assignments reference
   * it, so re-keying a show would orphan every performer cast in it. A time that
   * would duplicate the other show on the same date is rejected — `nextShow`
   * restores removed slots by matching on time.
   */
  const handleShowChange = (showId: string, field: 'date' | 'time' | 'callTime', value: string) => {
    if (!value) return false;
    if (field === 'time' && !timeIsFree(shows, showId, value)) return false;

    setShows(prev => sortShows(prev.map(show =>
      show.id === showId ? { ...show, [field]: value } : show
    )));
    return true;
  };

  /** Turn a single-show day into a double, leaving that day's existing cast alone. */
  const handleAddShowToDate = (date: string) => {
    const slot = addShowToDate(shows, date);
    if (!slot) return;
    setShows(prev => sortShows([...prev, { ...slot, id: generateId() }]));
  };

  /** Point a travel day at the city the company is moving to. */
  const handleSetDestination = (travelShowId: string, city: string) => {
    setShows(prev => setDestination(prev, travelShowId, city.trim()));
  };

  /** Undo for Remove Day: restore the next slot the week is missing. See `nextShow`. */
  const handleAddShow = () => {
    const slot = nextShow(baselineShows.current, shows);
    setShows(prev => sortShows([...prev, { ...slot, id: generateId() }]));
  };

  // Confirmation lives with the control in GridHead, not here.
  const handleRemoveShow = (showId: string) => {
    setShows(prev => prev.filter(show => show.id !== showId));
    setAssignments(prev => prev.filter(a => a.showId !== showId));
  };

  /** Resets times only; travel and day-off columns keep their status. */
  const handleResetShowTimes = () => setShows(resetShowTimes);

  // Handle assignment updates from the grid (for RED day toggles)
  const handleAssignmentUpdate = (updatedAssignments: Assignment[]) => {
    setAssignments(updatedAssignments);
  };

  return {
    isEditing,
    isLoading,
    castData,
    location,
    setLocation,
    week,
    setWeek,
    weekStartDate,
    shows,
    assignments,
    isGenerating,
    isSaving: createMutation.isPending || updateMutation.isPending,
    handleWeekStartDateChange,
    navigateToPreviousWeek,
    navigateToNextWeek,
    navigateToCurrentWeek,
    handleSave,
    handleAutoGenerate,
    handleClearAll,
    handleAssignmentChange,
    handleToggleRedDay,
    handleToggleOverride,
    handleShowStatusChange,
    handleShowChange,
    handleAddShowToDate,
    handleSetDestination,
    handleAddShow,
    handleRemoveShow,
    handleResetShowTimes,
    handleAssignmentUpdate,
  };
}
