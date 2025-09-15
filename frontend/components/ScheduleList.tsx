import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Edit, Trash2, Plus, Users } from 'lucide-react';
import backend from '~backend/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { formatDate, formatTime } from '../utils/dateUtils';

export default function ScheduleList() {
  const { toast } = useToast();

  const { data: schedulesData, isLoading, error, refetch } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => backend.scheduler.list()
  });

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      await backend.scheduler.deleteSchedule({ id });
      toast({
        title: "Success",
        description: "Schedule deleted successfully"
      });
      refetch();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      toast({
        title: "Error",
        description: "Failed to delete schedule",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading schedules...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">Failed to load schedules</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const schedules = schedulesData?.schedules || [];

  if (schedules.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="mx-auto max-w-md">
          <Calendar className="h-16 w-16 text-blue-500 mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-gray-900 mb-4">No Schedules Yet</h2>
          <p className="text-lg text-gray-600 mb-8">Create your first STOMP performance schedule to get started with cast management and show planning.</p>
          <Button asChild size="lg" className="px-8 py-3">
            <Link to="/schedule/new" className="flex items-center space-x-2">
              <Plus className="h-5 w-5" />
              <span>Create First Schedule</span>
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-100 rounded-xl p-8">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Performance Schedules</h1>
          <p className="text-xl text-gray-700 mb-6">
            Manage your STOMP theatrical performance schedules with intelligent cast assignment and conflict resolution.
          </p>
          <div className="flex items-center space-x-6 text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              <span>{schedules.length} {schedules.length === 1 ? 'Schedule' : 'Schedules'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-green-600" />
              <span>{schedules.reduce((total, s) => total + s.shows.length, 0)} Total Shows</span>
            </div>
            <div className="flex items-center space-x-2">
              <MapPin className="h-5 w-5 text-purple-600" />
              <span>{new Set(schedules.map(s => s.location)).size} Locations</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Recent Schedules</h2>
          <p className="text-gray-600">Manage and edit your performance schedules</p>
        </div>
        <Button asChild size="lg">
          <Link to="/schedule/new" className="flex items-center space-x-2">
            <Plus className="h-5 w-5" />
            <span>New Schedule</span>
          </Link>
        </Button>
      </div>

      {/* Schedule Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {schedules.map((schedule) => (
          <Card key={schedule.id} className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-xl font-bold text-gray-900">
                    {schedule.location}
                  </CardTitle>
                  <p className="text-sm font-medium text-blue-600">Week {schedule.week}</p>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {schedule.shows.length} shows
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium">{schedule.location}</span>
                </div>
                
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  <span>
                    {schedule.shows.length > 0 ? (
                      `${formatDate(schedule.shows[0].date)} - ${formatDate(schedule.shows[schedule.shows.length - 1].date)}`
                    ) : (
                      'No shows scheduled'
                    )}
                  </span>
                </div>

                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <span>Created {formatDate(schedule.createdAt instanceof Date ? schedule.createdAt.toISOString() : schedule.createdAt)}</span>
                </div>
              </div>

              {/* Show Status Summary */}
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center space-x-4 text-xs">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-gray-600">
                      {schedule.shows.filter(s => s.status === 'show').length} Shows
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span className="text-gray-600">
                      {schedule.shows.filter(s => s.status === 'travel').length} Travel
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    <span className="text-gray-600">
                      {schedule.shows.filter(s => s.status === 'dayoff').length} Off
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex space-x-2 pt-2">
                <Button asChild size="sm" className="flex-1">
                  <Link to={`/schedule/${schedule.id}`} className="flex items-center justify-center space-x-1">
                    <Edit className="h-3 w-3" />
                    <span>Edit</span>
                  </Link>
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(schedule.id)}
                  className="flex items-center space-x-1 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-200"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
