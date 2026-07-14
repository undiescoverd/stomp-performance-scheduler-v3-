import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import backend from '~backend/client';
import type { Show, Assignment, Role, DayStatus } from '~backend/scheduler/types';
import { normalizeTime } from '~backend/scheduler/time';
import { useToast } from '@/components/ui/use-toast';
import { isoDate } from '@/components/domain/format';
import { companyRedDate } from '@/components/domain/schedule-grid/logic';
import {
  addDaysIso,
  addShowToDate,
  applyShowStatus,
  dayDiffIso,
  nextMondayFrom,
  nextShow,
  resetShowTimes,
  restoreDate,
  setCompanyRedDay,
  setDestination,
  sortShows,
  timeIsFree,
  todayIso,
  weekStartOf,
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

  /**
   * Shaping history, newest last. Every edit that can destroy work snapshots
   * shows *and* assignments first, so Undo restores the cast a status change
   * cleared. This is what lets the confirm() dialogs go: destroying work behind
   * a modal is worse than letting it be undone. Safe because saves are explicit
   * (`handleSave` is the only caller of the mutations), so an unsaved edit can
   * never outlive the history.
   */
  const history = useRef<Array<{ shows: Show[]; assignments: Assignment[] }>>([]);
  const [canUndo, setCanUndo] = useState(false);
  const HISTORY_LIMIT = 50;
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

  // The true active roster, used only to gate Auto-Generate. castData can't be
  // used for this: getCastMembers() falls back to 12 phantom default cast when
  // the company is empty, so its length is never 0 — guarding on it would never
  // fire. getCompany() returns the real active members (['company'] key shared
  // with the Cast screen, so it's usually already cached).
  const { data: companyData, isLoading: isCompanyLoading } = useQuery({
    queryKey: ['company'],
    queryFn: () => backend.scheduler.getCompany(),
  });

  // Create schedule mutation
  const createMutation = useMutation({
    mutationFn: (data: { location: string; week: string; shows: Show[]; assignments?: Assignment[] }) =>
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
      // A schedule can also be a tour week (TourWeekRow links to
      // /schedule/:id) — invalidate so the Tours screen reflects edits.
      queryClient.invalidateQueries({ queryKey: ['tours'] });
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
    mutationFn: (data: { shows: Show[]; existingAssignments: Assignment[] }) =>
      backend.scheduler.autoGenerate(data),
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
        // "RED day" also matches the "more than one day off flagged" warning,
        // which is fine — that case is its own signal something needs fixing.
        const redDayWarnings = (response.warnings ?? []).filter(w => w.includes('RED day'));
        const hasCompanyRedDay = shows.some(s => s.isCompanyRedDay);

        if (maxShows > 6) {
          toast({
            title: "Warning",
            description: `Schedule generated but some performers may be overworked (${maxShows} shows max)`,
            variant: "destructive"
          });
        } else if (redDayWarnings.length > 0 && !hasCompanyRedDay) {
          toast({
            title: "Some RED days couldn't be seated",
            description: `${redDayWarnings.length} performer(s) didn't get an individual RED day this week. If the week has a day off, nominate it as the company RED day to guarantee everyone gets one.`,
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

  // All date math below works on YYYY-MM-DD strings anchored at UTC midnight
  // (week.ts helpers). Mixing local-time Dates with toISOString() shifted the
  // calendar date for users away from UTC — e.g. Monday 09:00 in Sydney is
  // Sunday 23:00 UTC, so the seeded week started a day early.

  // Helper function to calculate week number from date
  const getWeekNumberFromDate = (dateIso: string): number => {
    const date = new Date(`${isoDate(dateIso)}T00:00:00Z`);
    const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const pastDaysOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000);
    return Math.ceil((pastDaysOfYear + startOfYear.getUTCDay() + 1) / 7);
  };

  // Helper function to generate shows from week start date
  const generateShowsFromWeekStart = (weekStartDate: string): Show[] => {
    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

    const defaultShows: Show[] = [
      // Tuesday - 8pm Show, 5pm Call
      { id: generateId(), date: addDaysIso(weekStartDate, 1), time: '20:00', callTime: '17:00', status: 'show' },
      // Wednesday - 8pm Show, 6pm Call
      { id: generateId(), date: addDaysIso(weekStartDate, 2), time: '20:00', callTime: '18:00', status: 'show' },
      // Thursday - 8pm Show, 6pm Call
      { id: generateId(), date: addDaysIso(weekStartDate, 3), time: '20:00', callTime: '18:00', status: 'show' },
      // Friday - 8pm Show, 6pm Call
      { id: generateId(), date: addDaysIso(weekStartDate, 4), time: '20:00', callTime: '18:00', status: 'show' },
      // Saturday matinee - 3pm Show
      { id: generateId(), date: addDaysIso(weekStartDate, 5), time: '15:00', callTime: '13:30', status: 'show' },
      // Saturday evening - 8pm Show
      { id: generateId(), date: addDaysIso(weekStartDate, 5), time: '20:00', callTime: '18:00', status: 'show' },
      // Sunday matinee - 3pm Show
      { id: generateId(), date: addDaysIso(weekStartDate, 6), time: '15:00', callTime: '13:30', status: 'show' },
      // Sunday evening - 6pm Show
      { id: generateId(), date: addDaysIso(weekStartDate, 6), time: '18:00', callTime: '16:30', status: 'show' }
    ];

    return defaultShows;
  };

  // Handle week start date change
  const handleWeekStartDateChange = (newDate: string) => {
    const previousWeekStart = weekStartDate;
    setWeekStartDate(newDate);

    // Auto-calculate week number
    setWeek(getWeekNumberFromDate(newDate).toString());

    // Update existing shows dates if we have shows
    if (shows.length > 0) {
      // Each show keeps its position in the week. If there's no previous week
      // start to measure from (first time setting a date), fall back to the
      // standard-week index layout.
      const offsetFor = (date: string, index: number) =>
        previousWeekStart
          ? dayDiffIso(date, previousWeekStart)
          : (index < 4 ? index + 1 : index - 3);

      const shiftToNewWeek = (list: Show[]) =>
        list.map((show, index) => ({
          ...show,
          date: addDaysIso(newDate, offsetFor(isoDate(show.date), index)),
        }));

      setShows(shiftToNewWeek(shows));

      // Move the baseline with the week: nextShow()/restoreDate() compare
      // against it, and a stale baseline makes "Add Show" insert columns dated
      // in the week we just navigated away from.
      baselineShows.current = shiftToNewWeek(baselineShows.current);
    }
  };

  // Navigate to previous week
  const navigateToPreviousWeek = () => {
    handleWeekStartDateChange(addDaysIso(weekStartDate, -7));
  };

  // Navigate to next week
  const navigateToNextWeek = () => {
    handleWeekStartDateChange(addDaysIso(weekStartDate, 7));
  };

  // Navigate to current week
  const navigateToCurrentWeek = () => {
    handleWeekStartDateChange(nextMondayFrom(todayIso()));
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

      // The week's Monday comes from the *earliest* show, not shows[0]: nothing
      // keeps the array sorted once days are reshaped, and an unsorted first
      // element would slide the seven-day frame by a day.
      const start = weekStartOf(loaded);
      if (start) setWeekStartDate(start);
    }
  }, [scheduleData]);

  // Initialize default values for new schedule
  useEffect(() => {
    if (!isEditing) {
      const nextMonday = nextMondayFrom(todayIso());

      setWeek(getWeekNumberFromDate(nextMonday).toString());
      setLocation('London');
      setWeekStartDate(nextMonday);

      // Generate default shows
      const defaultShows = generateShowsFromWeekStart(nextMonday);
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
        // Include assignments so casting done before the first save (e.g.
        // auto-generate on /schedule/new) survives the create round-trip.
        await createMutation.mutateAsync({
          location,
          week,
          shows,
          assignments
        });
      }
    } catch (error) {
      // Error handling is done in mutation onError
    }
  };

  const handleAutoGenerate = async () => {
    // Gate on the active roster before doing any work, so an empty cast fails
    // instantly instead of the button spinning while the backend churns on
    // phantom default cast (see the companyData query above). Distinguish
    // still-loading from loaded-and-empty so a fast click during load doesn't
    // false-fire the "no cast" error.
    if (isCompanyLoading || !companyData) {
      toast({
        title: "One moment",
        description: "Cast list is still loading — try again in a second.",
      });
      return;
    }
    if (companyData.currentCompany.length === 0) {
      toast({
        title: "No cast members",
        description: "Add cast in the Cast area before generating a schedule.",
        variant: "destructive"
      });
      return;
    }

    const activeShows = shows.filter(show => show.status === 'show');
    if (activeShows.length === 0) {
      toast({
        title: "No Active Shows",
        description: "Please add shows with 'Show Day' status before generating assignments",
        variant: "destructive"
      });
      return;
    }

    snapshot();
    setIsGenerating(true);
    try {
      // Pass the current grid so Auto-Generate fills only empty slots and keeps
      // the user's manual picks (and any toggled RED day). The backend returns
      // the full merged set, so setAssignments(response.assignments) and the
      // pre-generate Undo snapshot both remain correct.
      await autoGenerateMutation.mutateAsync({ shows, existingAssignments: assignments });
    } catch (error) {
      // Error handling is done in mutation onError
    }
  };

  const handleClearAll = () => {
    snapshot();
    setAssignments([]);
    toast({
      title: 'Cleared',
      description: 'All assignments have been cleared. Undo to bring them back.',
    });
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
    // A company RED day covers everyone by derivation, so individual picks are
    // dormant and there is nothing to toggle. The chips are already disabled;
    // this keeps state consistent if the button is ever bypassed.
    const company = companyRedDate(shows);
    if (company) {
      toast({
        title: 'Covered by the company RED day',
        description: `The company RED day on ${company} is everyone's RED day this week. Remove the day off to set individual RED days again.`,
      });
      return;
    }

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
    snapshot();
    setShows(prev => applyShowStatus(prev, showId, status));

    // Clear assignments for this show if it's no longer a show day. Undo brings
    // them back, which is why no confirm() guards this.
    if (status !== 'show') {
      setAssignments(prev => prev.filter(a => a.showId !== showId));
    }
  };

  /** Nominate (or clear) a day off as the whole company's RED day. */
  const handleSetCompanyRedDay = (showId: string, on: boolean) => {
    snapshot();
    setShows(prev => setCompanyRedDay(prev, showId, on));
  };

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

  /** Record the week before an edit that could destroy work. */
  const snapshot = () => {
    history.current.push({ shows, assignments });
    if (history.current.length > HISTORY_LIMIT) history.current.shift();
    setCanUndo(true);
  };

  const handleUndo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    setShows(previous.shows);
    setAssignments(previous.assignments);
    setCanUndo(history.current.length > 0);
  };

  /**
   * Edit a show's date or times. Never touches `show.id`: assignments reference
   * it, so re-keying a show would orphan every performer cast in it. A time that
   * would duplicate the other show on the same date is rejected — `nextShow`
   * restores removed slots by matching on time.
   *
   * A cleared time commits as TBC, not "". Only the time fields are normalized:
   * `normalizeTime` on a date would turn "2025-08-05" into "TBC", since a date
   * isn't HH:MM either.
   */
  const handleShowChange = (showId: string, field: 'date' | 'time' | 'callTime', value: string) => {
    if (field === 'date' && !value) return false;
    const next = field === 'date' ? value : normalizeTime(value);
    if (field === 'time' && !timeIsFree(shows, showId, next)) return false;

    snapshot();
    setShows(prev => sortShows(prev.map(show =>
      show.id === showId ? { ...show, [field]: next } : show
    )));
    return true;
  };

  /** Turn a single-show day into a double, leaving that day's existing cast alone. */
  const handleAddShowToDate = (date: string) => {
    const slot = addShowToDate(shows, date);
    if (!slot) return;
    snapshot();
    setShows(prev => sortShows([...prev, { ...slot, id: generateId() }]));
  };

  /** Put an emptied day back, preferring the slot the week opened with. */
  const handleRestoreDate = (date: string) => {
    snapshot();
    setShows(prev => sortShows([...prev, { ...restoreDate(baselineShows.current, date), id: generateId() }]));
  };

  /** Point a travel day at the city the company is moving to. */
  const handleSetDestination = (travelShowId: string, city: string) => {
    snapshot();
    setShows(prev => setDestination(prev, travelShowId, city.trim()));
  };

  /** Undo for Remove Day: restore the next slot the week is missing. See `nextShow`. */
  const handleAddShow = () => {
    const slot = nextShow(baselineShows.current, shows);
    snapshot();
    setShows(prev => sortShows([...prev, { ...slot, id: generateId() }]));
  };

  /**
   * The last show anchors the week: `weekStartOf` derives the frame's Monday from
   * it, and `handleSave` refuses a schedule with none. Removing it is rejected
   * rather than silently leaving an editor with no week.
   */
  const handleRemoveShow = (showId: string) => {
    if (shows.length <= 1) {
      toast({
        title: "Can't remove the last day",
        description: 'A schedule needs at least one show, travel day or day off.',
        variant: 'destructive',
      });
      return;
    }
    snapshot();
    setShows(prev => prev.filter(show => show.id !== showId));
    setAssignments(prev => prev.filter(a => a.showId !== showId));
  };

  /** Resets times only; travel and day-off columns keep their status. */
  const handleResetShowTimes = () => {
    snapshot();
    setShows(resetShowTimes);
  };

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
    handleSetCompanyRedDay,
    handleShowChange,
    handleAddShowToDate,
    handleRestoreDate,
    handleSetDestination,
    handleAddShow,
    handleRemoveShow,
    canUndo,
    handleUndo,
    handleResetShowTimes,
    handleAssignmentUpdate,
  };
}
