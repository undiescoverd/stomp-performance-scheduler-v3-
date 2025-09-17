import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { 
  Calendar, 
  Settings, 
  ChevronDown, 
  ChevronUp,
  AlertCircle
} from 'lucide-react';
import { format, addDays, startOfWeek, addWeeks, isMonday } from 'date-fns';
import type { CompanyMember } from '~backend/scheduler/company';

const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 
  'Friday', 'Saturday', 'Sunday'
];

interface WeekConfig {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  isStandardWeek: boolean;
  customDays: boolean[];
  showCount: number;
}

interface WeekSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tourData: {
    tourName: string;
    segmentName: string;
    selectedCast: CompanyMember[];
    weeks: WeekConfig[];
  }) => void;
  selectedCast: CompanyMember[];
}

export function WeekSetupModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  selectedCast 
}: WeekSetupModalProps) {
  const [tourName, setTourName] = useState('');
  const [segmentName, setSegmentName] = useState('');
  const [numberOfWeeks, setNumberOfWeeks] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [weeks, setWeeks] = useState<WeekConfig[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  // Generate weeks when start date or number of weeks changes
  React.useEffect(() => {
    if (startDate && numberOfWeeks > 0) {
      const start = new Date(startDate);
      
      // Ensure start date is a Monday
      const weekStart = isMonday(start) ? start : startOfWeek(start, { weekStartsOn: 1 });
      
      const newWeeks: WeekConfig[] = [];
      for (let i = 0; i < numberOfWeeks; i++) {
        const weekStartDate = addWeeks(weekStart, i);
        const weekEndDate = addDays(weekStartDate, 6);
        
        newWeeks.push({
          weekNumber: i + 1,
          startDate: weekStartDate,
          endDate: weekEndDate,
          isStandardWeek: true,
          customDays: [true, true, true, true, true, true, true, true], // 8 shows for standard week
          showCount: 8
        });
      }
      setWeeks(newWeeks);
    }
  }, [startDate, numberOfWeeks]);

  const handleClose = () => {
    setTourName('');
    setSegmentName('');
    setNumberOfWeeks(1);
    setStartDate('');
    setWeeks([]);
    setExpandedWeeks(new Set());
    onClose();
  };

  const updateWeekType = (weekIndex: number, isStandard: boolean) => {
    setWeeks(prev => prev.map((week, index) => {
      if (index === weekIndex) {
        if (isStandard) {
          return {
            ...week,
            isStandardWeek: true,
            customDays: [true, true, true, true, true, true, true, true],
            showCount: 8
          };
        } else {
          return {
            ...week,
            isStandardWeek: false,
            customDays: [false, false, false, false, false, false, false],
            showCount: 0
          };
        }
      }
      return week;
    }));
  };

  const updateCustomDay = (weekIndex: number, dayIndex: number, hasShow: boolean) => {
    setWeeks(prev => prev.map((week, index) => {
      if (index === weekIndex && !week.isStandardWeek) {
        const newCustomDays = [...week.customDays];
        newCustomDays[dayIndex] = hasShow;
        const showCount = newCustomDays.filter(Boolean).length;
        
        return {
          ...week,
          customDays: newCustomDays,
          showCount
        };
      }
      return week;
    }));
  };

  const toggleWeekExpanded = (weekNumber: number) => {
    setExpandedWeeks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(weekNumber)) {
        newSet.delete(weekNumber);
      } else {
        newSet.add(weekNumber);
      }
      return newSet;
    });
  };

  const validateForm = () => {
    if (!tourName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a tour name",
        variant: "destructive"
      });
      return false;
    }

    if (!segmentName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a segment name",
        variant: "destructive"
      });
      return false;
    }

    if (!startDate) {
      toast({
        title: "Error",
        description: "Please select a start date",
        variant: "destructive"
      });
      return false;
    }

    const invalidWeeks = weeks.filter(week => week.showCount < 2);
    if (invalidWeeks.length > 0) {
      toast({
        title: "Error",
        description: "All weeks must have at least 2 shows",
        variant: "destructive"
      });
      return false;
    }

    return true;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    onConfirm({
      tourName: tourName.trim(),
      segmentName: segmentName.trim(),
      selectedCast,
      weeks
    });
  };

  const totalShows = weeks.reduce((sum, week) => sum + week.showCount, 0);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl h-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Configure Tour Weeks
          </DialogTitle>
          <DialogDescription>
            Set up your tour details and configure each week's performance schedule
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Tour Details */}
            <div className="space-y-4">
              <h3 className="font-medium">Tour Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tourName">Tour Name</Label>
                  <Input
                    id="tourName"
                    value={tourName}
                    onChange={(e) => setTourName(e.target.value)}
                    placeholder="e.g., Spring 2024 Tour"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="segmentName">Segment Name</Label>
                  <Input
                    id="segmentName"
                    value={segmentName}
                    onChange={(e) => setSegmentName(e.target.value)}
                    placeholder="e.g., East Coast Cities"
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="numberOfWeeks">Number of Weeks</Label>
                  <Input
                    id="numberOfWeeks"
                    type="number"
                    min="1"
                    max="12"
                    value={numberOfWeeks}
                    onChange={(e) => setNumberOfWeeks(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date (Monday)</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {startDate && !isMonday(new Date(startDate)) && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <p className="text-sm text-amber-700">
                    Tours typically start on Monday. The start date will be adjusted to the nearest Monday.
                  </p>
                </div>
              )}
            </div>

            {/* Week Configuration */}
            {weeks.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Week Configuration</h3>
                  <Badge variant="outline">
                    {totalShows} total shows
                  </Badge>
                </div>

                <div className="space-y-3">
                  {weeks.map((week, index) => (
                    <Card key={week.weekNumber} className="border">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <CardTitle className="text-sm">
                              Week {week.weekNumber}
                            </CardTitle>
                            <Badge variant="secondary" className="text-xs">
                              {format(week.startDate, 'MMM d')} - {format(week.endDate, 'MMM d')}
                            </Badge>
                            <Badge variant={week.showCount >= 2 ? "default" : "destructive"} className="text-xs">
                              {week.showCount} shows
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleWeekExpanded(week.weekNumber)}
                          >
                            {expandedWeeks.has(week.weekNumber) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </CardHeader>
                      
                      {expandedWeeks.has(week.weekNumber) && (
                        <CardContent className="pt-0">
                          <div className="space-y-4">
                            <RadioGroup
                              value={week.isStandardWeek ? "standard" : "custom"}
                              onValueChange={(value) => updateWeekType(index, value === "standard")}
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="standard" id={`standard-${week.weekNumber}`} />
                                <Label htmlFor={`standard-${week.weekNumber}`}>
                                  Standard 8-show week
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="custom" id={`custom-${week.weekNumber}`} />
                                <Label htmlFor={`custom-${week.weekNumber}`}>
                                  Custom schedule
                                </Label>
                              </div>
                            </RadioGroup>

                            {!week.isStandardWeek && (
                              <div className="space-y-3">
                                <Label className="text-sm font-medium">Select show days:</Label>
                                <div className="grid grid-cols-7 gap-2">
                                  {DAYS_OF_WEEK.map((day, dayIndex) => (
                                    <div key={day} className="text-center">
                                      <div className="text-xs font-medium mb-1">{day.slice(0, 3)}</div>
                                      <Checkbox
                                        checked={week.customDays[dayIndex] || false}
                                        onCheckedChange={(checked) => 
                                          updateCustomDay(index, dayIndex, checked as boolean)
                                        }
                                      />
                                    </div>
                                  ))}
                                </div>
                                {week.showCount < 2 && (
                                  <p className="text-sm text-destructive flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4" />
                                    Minimum 2 shows required per week
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={weeks.length === 0 || weeks.some(w => w.showCount < 2)}
          >
            Create Tour ({selectedCast.length} cast, {weeks.length} weeks)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}