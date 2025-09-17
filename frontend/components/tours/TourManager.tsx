import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { 
  Plus, 
  Map, 
  Users, 
  Calendar, 
  CheckCircle, 
  XCircle,
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import backend from '~backend/client';
import type { CompanyMember } from '~backend/scheduler/company';
import { CastSelectionModal } from './CastSelectionModal';
import { WeekSetupModal } from './WeekSetupModal';
import { TourFolderView } from './TourFolderView';

interface WeekConfig {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  isStandardWeek: boolean;
  customDays: boolean[];
  showCount: number;
}

interface TourCreationData {
  tourName: string;
  segmentName: string;
  selectedCast: CompanyMember[];
  weeks: WeekConfig[];
}

type CreationStep = 'idle' | 'selectingCast' | 'configuringWeeks' | 'creating';

export default function TourManager() {
  const [currentStep, setCurrentStep] = useState<CreationStep>('idle');
  const [selectedCast, setSelectedCast] = useState<CompanyMember[]>([]);
  const [creationProgress, setCreationProgress] = useState(0);
  const [creationStatus, setCreationStatus] = useState('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Bulk tour creation mutation
  const createTourMutation = useMutation({
    mutationFn: async (tourData: TourCreationData) => {
      setCreationProgress(10);
      setCreationStatus('Creating tour structure...');
      
      // Calculate date range for the tour
      const startDate = tourData.weeks[0]?.startDate || new Date();
      const endDate = tourData.weeks[tourData.weeks.length - 1]?.endDate || new Date();

      setCreationProgress(30);
      setCreationStatus('Setting up cast assignments...');

      const result = await backend.scheduler.createTourBulk({
        name: tourData.tourName,
        segmentName: tourData.segmentName,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        castMemberIds: tourData.selectedCast.map(member => member.id),
        weekCount: tourData.weeks.length,
        scheduleType: 'standard' // For now, we'll use standard weeks
      });

      setCreationProgress(60);
      setCreationStatus('Generating schedules...');

      // Simulate schedule generation progress
      for (let i = 60; i <= 90; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 300));
        setCreationProgress(i);
        setCreationStatus(`Generating schedules... Week ${Math.floor((i - 60) / 10) + 1}/${tourData.weeks.length}`);
      }

      setCreationProgress(100);
      setCreationStatus('Complete!');

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      
      if (result.success && result.tour) {
        toast({
          title: "Tour Created Successfully!",
          description: `Created ${result.tour.name} with ${result.createdWeeks} weeks`
        });
      } else {
        toast({
          title: "Tour Creation Had Issues",
          description: result.errors?.join(', ') || "Some errors occurred during creation",
          variant: "destructive"
        });
      }

      // Reset state
      setCurrentStep('idle');
      setSelectedCast([]);
      setCreationProgress(0);
      setCreationStatus('');
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create tour. Please try again.",
        variant: "destructive"
      });
      
      setCurrentStep('idle');
      setCreationProgress(0);
      setCreationStatus('');
    }
  });

  const startTourCreation = () => {
    setCurrentStep('selectingCast');
  };

  const handleCastSelected = (cast: CompanyMember[]) => {
    setSelectedCast(cast);
    setCurrentStep('configuringWeeks');
  };

  const handleWeekConfigConfirmed = (tourData: TourCreationData) => {
    setCurrentStep('creating');
    createTourMutation.mutate(tourData);
  };

  const handleViewWeek = (tourId: string, weekId: string) => {
    // Navigate to schedule editor for specific week
    navigate(`/schedule/${weekId}`);
  };

  const handleEditWeek = (tourId: string, weekId: string) => {
    // Navigate to schedule editor for specific week
    navigate(`/schedule/${weekId}`);
  };

  const handleCancel = () => {
    setCurrentStep('idle');
    setSelectedCast([]);
    setCreationProgress(0);
    setCreationStatus('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tour Management</h1>
          <p className="text-muted-foreground">
            Create and manage multi-week tour segments with bulk scheduling
          </p>
        </div>
        <Button 
          onClick={startTourCreation}
          disabled={currentStep !== 'idle'}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Create New Tour Segment
        </Button>
      </div>

      {/* Creation Progress */}
      {currentStep === 'creating' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Creating Tour
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{creationStatus}</span>
                <span>{creationProgress}%</span>
              </div>
              <Progress value={creationProgress} className="w-full" />
            </div>
            
            <div className="flex items-center justify-center pt-4">
              <Button 
                variant="outline" 
                onClick={handleCancel}
                disabled={createTourMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tour Creation Summary */}
      {currentStep !== 'idle' && currentStep !== 'creating' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="h-5 w-5" />
              Tour Creation Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  {selectedCast.length === 12 ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground"></div>
                  )}
                  <span className={selectedCast.length === 12 ? "text-green-600" : "text-muted-foreground"}>
                    Cast Selection ({selectedCast.length}/12)
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {currentStep === 'configuringWeeks' ? (
                    <div className="h-5 w-5 rounded-full border-2 border-primary bg-primary/20"></div>
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground"></div>
                  )}
                  <span className={currentStep === 'configuringWeeks' ? "text-primary" : "text-muted-foreground"}>
                    Week Configuration
                  </span>
                </div>
              </div>

              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      {currentStep === 'idle' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center p-6">
              <Map className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-muted-foreground">Active Tours</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center p-6">
              <Calendar className="h-8 w-8 text-green-600 mr-3" />
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-muted-foreground">Scheduled Weeks</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center p-6">
              <Users className="h-8 w-8 text-purple-600 mr-3" />
              <div>
                <p className="text-2xl font-bold">12</p>
                <p className="text-sm text-muted-foreground">Cast Members Required</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tours List */}
      {currentStep === 'idle' && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Existing Tours</h2>
          <TourFolderView 
            onViewWeek={handleViewWeek}
            onEditWeek={handleEditWeek}
          />
        </div>
      )}

      {/* Modals */}
      <CastSelectionModal
        isOpen={currentStep === 'selectingCast'}
        onClose={handleCancel}
        onConfirm={handleCastSelected}
        initialSelection={selectedCast}
      />

      <WeekSetupModal
        isOpen={currentStep === 'configuringWeeks'}
        onClose={handleCancel}
        onConfirm={handleWeekConfigConfirmed}
        selectedCast={selectedCast}
      />
    </div>
  );
}