import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import backend from '~backend/client';
import type { Schedule, Show, Assignment, Role, DayStatus } from '~backend/scheduler/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Separator } from '@/components/ui/separator';
import { ScheduleGrid } from './ScheduleGrid';
import { ScheduleAnalytics } from './ScheduleAnalytics';
import { ExportControls } from './ExportControls';
import { Save, ArrowLeft, Calendar, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

export default function ScheduleEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [location, setLocation] = useState('');
  const [week, setWeek] = useState('');
  const [weekStartDate, setWeekStartDate] = useState('');
  const [shows, setShows] = useState<Show[]>([]);
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
    queryFn: () => backend.scheduler.getCastMembers()
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
    onSuccess: (response) => {
      if (response.success) {
        setAssignments(response.assignments);
        toast({
          title: "Success",
          description: "Schedule generated successfully"
        });
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
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 1 * 24 * 60 * 60 * 1000)), time: '21:00', callTime: '19:00', status: 'show' }, // Tuesday
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000)), time: '21:00', callTime: '19:00', status: 'show' }, // Wednesday
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000)), time: '21:00', callTime: '19:00', status: 'show' }, // Thursday
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 4 * 24 * 60 * 60 * 1000)), time: '21:00', callTime: '18:00', status: 'show' }, // Friday
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000)), time: '16:00', callTime: '14:00', status: 'show' }, // Saturday matinee
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000)), time: '21:00', callTime: '18:00', status: 'show' }, // Saturday evening
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)), time: '16:00', callTime: '14:30', status: 'show' }, // Sunday matinee
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)), time: '19:00', callTime: '18:00', status: 'show' }  // Sunday evening
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
      setShows(schedule.shows);
      setAssignments(schedule.assignments);

      // Calculate week start date from first show
      if (schedule.shows.length > 0) {
        const firstShowDate = new Date(schedule.shows[0].date);
        // Find the Monday of that week
        const dayOfWeek = firstShowDate.getDay();
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, so 6 days from Monday
        const mondayDate = new Date(firstShowDate.getTime() - daysFromMonday * 24 * 60 * 60 * 1000);
        setWeekStartDate(formatDateForInput(mondayDate));
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
      const filtered = prev.filter(a => !(a.showId === showId && a.role === role));
      
      // Add new assignment if performer is selected
      if (performer) {
        filtered.push({ showId, role, performer });
      }
      
      return filtered;
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

  const handleShowChange = (showId: string, field: 'date' | 'time' | 'callTime', value: string) => {
    setShows(prev => prev.map(show => 
      show.id === showId ? { ...show, [field]: value } : show
    ));
  };

  const handleAddShow = () => {
    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    const lastShow = shows[shows.length - 1];
    const nextDate = lastShow ? 
      new Date(new Date(lastShow.date).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] :
      new Date().toISOString().split('T')[0];

    const newShow: Show = {
      id: generateId(),
      date: nextDate,
      time: '21:00',
      callTime: '19:00',
      status: 'show'
    };

    setShows(prev => [...prev, newShow]);
  };

  const handleRemoveShow = (showId: string) => {
    if (confirm('Are you sure you want to remove this show?')) {
      setShows(prev => prev.filter(show => show.id !== showId));
      setAssignments(prev => prev.filter(a => a.showId !== showId));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">City</Label>
              <Input
                id="location"
                placeholder="e.g., London, New York, Tokyo"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="weekStartDate">Week Start Date</Label>
              <div className="flex items-center space-x-2">
                <div className="flex items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={navigateToPreviousWeek}
                    className="px-2 rounded-r-none border-r-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10 pointer-events-none" />
                    <Input
                      id="weekStartDate"
                      type="date"
                      value={weekStartDate}
                      onChange={(e) => handleWeekStartDateChange(e.target.value)}
                      className="pl-10 rounded-none border-x-0"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={navigateToNextWeek}
                    className="px-2 rounded-l-none border-l-0 rounded-r-none border-r-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={navigateToCurrentWeek}
                    className="px-2 rounded-l-none text-xs"
                    title="Jump to current week"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="week">Week Number</Label>
              <Input
                id="week"
                placeholder="Auto-calculated"
                value={week}
                onChange={(e) => setWeek(e.target.value)}
                className="bg-gray-50"
              />
              <p className="text-xs text-gray-500">Auto-calculated from start date</p>
            </div>
          </div>
          
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {isEditing ? 'Save Changes' : 'Create Schedule'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Grid */}
      <ScheduleGrid
        shows={shows}
        assignments={assignments}
        castMembers={castData?.castMembers || []}
        roles={castData?.roles || []}
        location={location}
        onAssignmentChange={handleAssignmentChange}
        onShowStatusChange={handleShowStatusChange}
        onShowChange={handleShowChange}
        onAddShow={handleAddShow}
        onRemoveShow={handleRemoveShow}
        onClearAll={handleClearAll}
        onAutoGenerate={handleAutoGenerate}
        isGenerating={isGenerating}
      />

      {/* Analytics */}
      {shows.length > 0 && (
        <ScheduleAnalytics
          shows={shows.filter(show => show.status === 'show')}
          assignments={assignments}
          castMembers={castData?.castMembers || []}
        />
      )}

      {/* Export Controls */}
      {shows.length > 0 && (
        <ExportControls
          location={location}
          week={week}
          shows={shows}
          assignments={assignments}
          castMembers={castData?.castMembers || []}
          roles={castData?.roles || []}
        />
      )}
    </div>
  );
}
