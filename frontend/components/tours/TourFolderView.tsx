import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import client from '~backend/client';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen, 
  Calendar, 
  Eye, 
  Edit, 
  Trash2,
  MapPin,
  Clock,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import { format } from 'date-fns';

interface TourWeek {
  id: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  showCount: number;
  locationCity: string;
}

interface TourSegment {
  id: string;
  name: string;
  segmentName: string;
  parentTourName?: string;
  startDate: string;
  endDate: string;
  weeks: TourWeek[];
  createdAt?: string;
}

interface TourGroup {
  tourName: string;
  segments: TourSegment[];
  totalWeeks: number;
  overallStartDate: string;
  overallEndDate: string;
  createdAt: string;
}

export function TourFolderView({ onNewSegment }: { onNewSegment?: () => void }) {
  const [expandedTours, setExpandedTours] = useState<Set<string>>(new Set());
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ 
    type: 'tour' | 'segment' | 'week', 
    id: string, 
    tourName?: string,
    segmentId?: string 
  } | null>(null);
  
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch tours and group them
  const { data: toursData, isLoading, isError, error } = useQuery({
    queryKey: ['tours'],
    queryFn: async () => {
      const data = await client.scheduler.getTours({});
      
      // Group tours by parent tour name
      const grouped: { [key: string]: TourGroup } = {};
      
      data.tours?.forEach((tour: TourSegment) => {
        const parentName = tour.parentTourName || tour.name;
        
        if (!grouped[parentName]) {
          grouped[parentName] = {
            tourName: parentName,
            segments: [],
            totalWeeks: 0,
            overallStartDate: tour.startDate,
            overallEndDate: tour.endDate,
            createdAt: tour.createdAt || new Date().toISOString()
          };
        }
        
        grouped[parentName].segments.push(tour);
        grouped[parentName].totalWeeks += tour.weeks.length;
        
        // Update date range
        if (tour.startDate < grouped[parentName].overallStartDate) {
          grouped[parentName].overallStartDate = tour.startDate;
        }
        if (tour.endDate > grouped[parentName].overallEndDate) {
          grouped[parentName].overallEndDate = tour.endDate;
        }
      });
      
      return Object.values(grouped);
    },
  });

  // Delete mutations
  const deleteTourMutation = useMutation({
    mutationFn: async (tourName: string) => {
      // Delete all segments with this tour name
      const tourGroup = toursData?.find(g => g.tourName === tourName);
      if (tourGroup) {
        await Promise.all(tourGroup.segments.map(segment =>
          client.scheduler.deleteTour({ id: segment.id })
        ));
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      toast.success('Tour deleted successfully');
    },
  });

  const deleteSegmentMutation = useMutation({
    mutationFn: async (segmentId: string) => {
      return await client.scheduler.deleteTour({ id: segmentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      toast.success('Segment deleted successfully');
    },
  });

  const deleteWeekMutation = useMutation({
    mutationFn: async ({ segmentId, weekId }: { segmentId: string; weekId: string }) => {
      return await client.scheduler.deleteTourWeek({ tourId: segmentId, weekId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      toast.success('Week deleted successfully');
    },
  });

  const toggleTourExpansion = (tourName: string) => {
    const newExpanded = new Set(expandedTours);
    if (newExpanded.has(tourName)) {
      newExpanded.delete(tourName);
    } else {
      newExpanded.add(tourName);
    }
    setExpandedTours(newExpanded);
  };

  const toggleSegmentExpansion = (segmentId: string) => {
    const newExpanded = new Set(expandedSegments);
    if (newExpanded.has(segmentId)) {
      newExpanded.delete(segmentId);
    } else {
      newExpanded.add(segmentId);
    }
    setExpandedSegments(newExpanded);
  };

  const handleView = (weekId: string) => {
    navigate(`/schedule/${weekId}`);
  };

  const handleEdit = (weekId: string) => {
    navigate(`/schedule/${weekId}?edit=true`);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'tour') {
      deleteTourMutation.mutate(deleteTarget.id);
    } else if (deleteTarget.type === 'segment') {
      deleteSegmentMutation.mutate(deleteTarget.id);
    } else if (deleteTarget.segmentId) {
      deleteWeekMutation.mutate({ 
        segmentId: deleteTarget.segmentId, 
        weekId: deleteTarget.id 
      });
    }
    
    setDeleteTarget(null);
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">Loading tours...</div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-500">Error loading tours: {error?.message}</div>
          <Button onClick={() => queryClient.refetchQueries({ queryKey: ['tours'] })} className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const tourGroups = toursData || [];

  if (tourGroups.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Folder className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">No tours created yet</p>
          <p className="text-sm text-gray-400 mt-2">Click "Create New Tour Segment" to get started</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            {tourGroups.map((tourGroup) => {
              const isTourExpanded = expandedTours.has(tourGroup.tourName);
              
              return (
                <div key={tourGroup.tourName} className="border rounded-lg bg-white">
                  {/* Parent Tour Folder */}
                  <div 
                    className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer group"
                    onClick={() => toggleTourExpansion(tourGroup.tourName)}
                  >
                    <div className="flex items-center gap-3">
                      <button className="p-0">
                        {isTourExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </button>
                      {isTourExpanded ? 
                        <FolderOpen className="w-6 h-6 text-blue-600" /> : 
                        <Folder className="w-6 h-6 text-blue-500" />
                      }
                      <div>
                        <span className="font-semibold text-lg">{tourGroup.tourName}</span>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                          <span>{tourGroup.segments.length} segments</span>
                          <span>{tourGroup.totalWeeks} total weeks</span>
                          <span>{formatDateRange(tourGroup.overallStartDate, tourGroup.overallEndDate)}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Created {format(new Date(tourGroup.createdAt), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Could implement add segment to existing tour
                          toast.info('Add segment to tour coming soon');
                        }}
                      >
                        <Plus className="w-4 h-4" />
                        Add Segment
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ 
                            type: 'tour', 
                            id: tourGroup.tourName 
                          });
                        }}
                        className="opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete Tour
                      </Button>
                    </div>
                  </div>
                  
                  {/* Tour Segments */}
                  {isTourExpanded && (
                    <div className="border-t bg-gray-50">
                      {tourGroup.segments.map((segment) => {
                        const isSegmentExpanded = expandedSegments.has(segment.id);
                        
                        return (
                          <div key={segment.id} className="border-b last:border-b-0">
                            {/* Segment Header */}
                            <div
                              className="flex items-center justify-between px-8 py-3 hover:bg-gray-100 cursor-pointer"
                              onClick={() => toggleSegmentExpansion(segment.id)}
                            >
                              <div className="flex items-center gap-3">
                                <button className="p-0">
                                  {isSegmentExpanded ? 
                                    <ChevronDown className="w-4 h-4" /> : 
                                    <ChevronRight className="w-4 h-4" />
                                  }
                                </button>
                                <MapPin className="w-4 h-4 text-gray-500" />
                                <span className="font-medium">{segment.segmentName}</span>
                                <span className="text-sm text-gray-500">
                                  ({segment.weeks.length} weeks)
                                </span>
                                <span className="text-sm text-gray-400">
                                  {formatDateRange(segment.startDate, segment.endDate)}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget({ 
                                    type: 'segment', 
                                    id: segment.id,
                                    tourName: tourGroup.tourName 
                                  });
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Delete Segment
                              </Button>
                            </div>
                            
                            {/* Weeks */}
                            {isSegmentExpanded && (
                              <div className="bg-white">
                                {segment.weeks.map((week) => (
                                  <div
                                    key={week.id}
                                    className="flex items-center justify-between px-16 py-2 hover:bg-gray-50 border-t"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Calendar className="w-4 h-4 text-gray-400" />
                                      <span className="font-medium">Week {week.weekNumber}</span>
                                      <div className="flex items-center gap-1 text-sm text-gray-600">
                                        <MapPin className="w-3 h-3" />
                                        {week.locationCity || segment.segmentName}
                                      </div>
                                      <span className="text-sm text-gray-500">
                                        {formatDateRange(week.startDate, week.endDate)}
                                      </span>
                                      <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                        {week.showCount} shows
                                      </span>
                                    </div>
                                    
                                    <div className="flex items-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleView(week.id)}
                                      >
                                        <Eye className="w-4 h-4 mr-1" />
                                        View
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleEdit(week.id)}
                                      >
                                        <Edit className="w-4 h-4 mr-1" />
                                        Edit
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => setDeleteTarget({ 
                                          type: 'week', 
                                          id: week.id, 
                                          segmentId: segment.id 
                                        })}
                                      >
                                        <Trash2 className="w-4 h-4 mr-1" />
                                        Delete Week
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'tour' 
                ? `This will permanently delete the entire tour "${deleteTarget.id}" including ALL segments and weeks. This action cannot be undone.`
                : deleteTarget?.type === 'segment'
                ? 'This will permanently delete this segment and all its weeks. This action cannot be undone.'
                : 'This will permanently delete this week and all its assignments. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="mr-2">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}