import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { 
  Folder, 
  FolderOpen, 
  Calendar, 
  MapPin, 
  Users, 
  Eye, 
  Edit, 
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import backend from '~backend/client';

interface Tour {
  id: string;
  name: string;
  segmentName: string;
  startDate: string;
  endDate: string;
  castMemberIds: string[];
  createdAt: Date;
  updatedAt: Date;
  weekCount: number;
  weeks: TourWeek[];
}

interface TourWeek {
  id: string;
  location: string;
  week: string;
  tourSegment: string;
  showCount: number;
}

interface TourFolderViewProps {
  onEditWeek?: (tourId: string, weekId: string) => void;
  onViewWeek?: (tourId: string, weekId: string) => void;
}

export function TourFolderView({ onEditWeek, onViewWeek }: TourFolderViewProps) {
  const [expandedTours, setExpandedTours] = useState<Set<string>>(new Set());
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    type: 'tour' | 'week';
    id: string;
    name: string;
    tourId?: string;
  }>({ isOpen: false, type: 'tour', id: '', name: '' });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch tours
  const { data: toursResponse, isLoading } = useQuery({
    queryKey: ['tours'],
    queryFn: () => backend.scheduler.getTours(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const tours = toursResponse?.tours || [];

  // Delete tour mutation
  const deleteTourMutation = useMutation({
    mutationFn: (tourId: string) => backend.scheduler.deleteTour({ id: tourId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      toast({
        title: "Tour Deleted",
        description: "Tour and all associated schedules have been deleted."
      });
      setDeleteDialog({ isOpen: false, type: 'tour', id: '', name: '' });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete tour. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Delete week mutation
  const deleteWeekMutation = useMutation({
    mutationFn: ({ tourId, weekId }: { tourId: string; weekId: string }) => 
      backend.scheduler.deleteTourWeek({ tourId, weekId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      toast({
        title: "Week Deleted",
        description: "Schedule week has been deleted."
      });
      setDeleteDialog({ isOpen: false, type: 'week', id: '', name: '' });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete week. Please try again.",
        variant: "destructive"
      });
    }
  });

  const toggleTourExpanded = (tourId: string) => {
    const newExpanded = new Set(expandedTours);
    if (newExpanded.has(tourId)) {
      newExpanded.delete(tourId);
    } else {
      newExpanded.add(tourId);
    }
    setExpandedTours(newExpanded);
  };

  const handleDeleteTour = (tour: Tour) => {
    setDeleteDialog({
      isOpen: true,
      type: 'tour',
      id: tour.id,
      name: tour.name
    });
  };

  const handleDeleteWeek = (tourId: string, week: TourWeek) => {
    setDeleteDialog({
      isOpen: true,
      type: 'week',
      id: week.id,
      name: `${week.week} - ${week.location}`,
      tourId
    });
  };

  const confirmDelete = () => {
    if (deleteDialog.type === 'tour') {
      deleteTourMutation.mutate(deleteDialog.id);
    } else if (deleteDialog.type === 'week' && deleteDialog.tourId) {
      deleteWeekMutation.mutate({ 
        tourId: deleteDialog.tourId, 
        weekId: deleteDialog.id 
      });
    }
  };

  const cancelDelete = () => {
    setDeleteDialog({ isOpen: false, type: 'tour', id: '', name: '' });
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-2 text-sm text-muted-foreground">Loading tours...</p>
      </div>
    );
  }

  if (tours.length === 0) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Tours Created</h3>
          <p className="text-muted-foreground mb-4">
            Create your first tour segment to get started with bulk scheduling
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {tours.map((tour: Tour) => {
          const isExpanded = expandedTours.has(tour.id);
          const totalWeeks = tour.weeks.length;
          const totalShows = tour.weeks.reduce((sum: number, week: TourWeek) => sum + week.showCount, 0);

          return (
            <Card key={tour.id} className="border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div 
                    className="flex items-center gap-3 cursor-pointer flex-1"
                    onClick={() => toggleTourExpanded(tour.id)}
                  >
                    {isExpanded ? (
                      <FolderOpen className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Folder className="h-5 w-5 text-gray-600" />
                    )}
                    <div>
                      <h3 className="font-medium">{tour.name}</h3>
                      <p className="text-sm text-muted-foreground">{tour.segmentName}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {totalWeeks} weeks
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {totalShows} shows
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTour(tour);
                      }}
                      className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="text-xs text-muted-foreground mt-2">
                  {format(new Date(tour.startDate), 'MMM d')} - {format(new Date(tour.endDate), 'MMM d, yyyy')}
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {tour.weeks.map((week: TourWeek) => (
                      <div
                        key={week.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Calendar className="h-4 w-4 text-gray-600" />
                          <div>
                            <p className="font-medium text-sm">{week.week}</p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {week.location}
                              </span>
                              <span>{week.showCount} shows</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          {onViewWeek && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onViewWeek(tour.id, week.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {onEditWeek && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEditWeek(tour.id, week.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteWeek(tour.id, week)}
                            className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.isOpen} onOpenChange={cancelDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              {deleteDialog.type === 'tour' ? (
                <>
                  Are you sure you want to delete the tour "{deleteDialog.name}"? 
                  This will also delete all associated schedules and cannot be undone.
                </>
              ) : (
                <>
                  Are you sure you want to delete "{deleteDialog.name}"? 
                  This will remove the schedule and cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDelete}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete}
              disabled={deleteTourMutation.isPending || deleteWeekMutation.isPending}
            >
              {(deleteTourMutation.isPending || deleteWeekMutation.isPending) && 
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
              }
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}