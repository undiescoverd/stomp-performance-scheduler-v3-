import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, MapPin, Plane } from 'lucide-react';
import { format, addDays, startOfWeek } from 'date-fns';
import { toast } from 'sonner';

interface WeekConfig {
  weekNumber: number;
  startDate: string;
  endDate: string;
  locationCity: string; // NEW
  isStandard: boolean;
  travelDay: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' | 'none'; // NEW
  customShows?: any[];
}

interface WeekSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tourName: string, segmentName: string, weeks: WeekConfig[]) => void;
  selectedCastIds: string[];
}

export function WeekSetupModal({ 
  isOpen, 
  onClose, 
  onConfirm,
  selectedCastIds 
}: WeekSetupModalProps) {
  const [tourName, setTourName] = useState('');
  const [segmentName, setSegmentName] = useState('');
  const [numberOfWeeks, setNumberOfWeeks] = useState(4);
  const [startDate, setStartDate] = useState('');
  const [weekConfigs, setWeekConfigs] = useState<WeekConfig[]>([]);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (startDate && numberOfWeeks) {
      const configs: WeekConfig[] = [];
      const start = new Date(startDate);
      
      // Adjust to start on Monday
      const monday = startOfWeek(start, { weekStartsOn: 1 });
      
      for (let i = 0; i < numberOfWeeks; i++) {
        const weekStart = addDays(monday, i * 7);
        const weekEnd = addDays(weekStart, 6);
        
        configs.push({
          weekNumber: i + 1,
          startDate: format(weekStart, 'yyyy-MM-dd'),
          endDate: format(weekEnd, 'yyyy-MM-dd'),
          locationCity: segmentName || '', // Default to segment name
          isStandard: true,
          travelDay: i === 0 ? 'monday' : 'none', // First week usually has Monday travel
          customShows: []
        });
      }
      
      setWeekConfigs(configs);
    }
  }, [startDate, numberOfWeeks, segmentName]);

  const handleWeekTypeChange = (weekIndex: number, isStandard: boolean) => {
    const updated = [...weekConfigs];
    updated[weekIndex].isStandard = isStandard;
    
    if (!isStandard) {
      // Initialize custom shows for this week
      updated[weekIndex].customShows = generateCustomWeekTemplate(
        updated[weekIndex].startDate,
        updated[weekIndex].travelDay
      );
    }
    
    setWeekConfigs(updated);
  };

  const handleLocationChange = (weekIndex: number, city: string) => {
    const updated = [...weekConfigs];
    updated[weekIndex].locationCity = city;
    setWeekConfigs(updated);
  };

  const handleTravelDayChange = (weekIndex: number, day: string) => {
    const updated = [...weekConfigs];
    updated[weekIndex].travelDay = day as any;
    
    // Regenerate custom shows if needed
    if (!updated[weekIndex].isStandard) {
      updated[weekIndex].customShows = generateCustomWeekTemplate(
        updated[weekIndex].startDate,
        day as any
      );
    }
    
    setWeekConfigs(updated);
  };

  const generateCustomWeekTemplate = (weekStart: string, travelDay: string) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const shows: any[] = [];
    const start = new Date(weekStart);
    
    days.forEach((day, index) => {
      const showDate = addDays(start, index);
      const dateStr = format(showDate, 'yyyy-MM-dd');
      const currentDayKey = dayKeys[index];
      
      if (currentDayKey === travelDay) {
        // Travel day
        shows.push({
          id: `${dateStr}_travel`,
          date: dateStr,
          time: '00:00',
          status: 'travel',
          enabled: true
        });
      } else if (index < 5 && currentDayKey !== travelDay) {
        // Weekday evenings (not travel day)
        shows.push({
          id: `${dateStr}_eve`,
          date: dateStr,
          time: '20:00',
          status: 'show',
          enabled: true
        });
      } else if (index === 5) {
        // Saturday - matinee and evening
        shows.push({
          id: `${dateStr}_mat`,
          date: dateStr,
          time: '15:00',
          status: 'show',
          enabled: true
        });
        shows.push({
          id: `${dateStr}_eve`,
          date: dateStr,
          time: '20:00',
          status: 'show',
          enabled: true
        });
      } else if (index === 6) {
        // Sunday - matinee and evening
        shows.push({
          id: `${dateStr}_mat`,
          date: dateStr,
          time: '15:00',
          status: 'show',
          enabled: true
        });
        shows.push({
          id: `${dateStr}_eve`,
          date: dateStr,
          time: '19:00',
          status: 'show',
          enabled: true
        });
      }
    });
    
    return shows;
  };

  const toggleCustomShow = (weekIndex: number, showIndex: number) => {
    const updated = [...weekConfigs];
    const show = updated[weekIndex].customShows![showIndex];
    
    if (show.enabled) {
      show.enabled = false;
      show.status = show.status === 'travel' ? 'travel' : 'dayoff';
    } else {
      show.enabled = true;
      show.status = show.id.includes('travel') ? 'travel' : 'show';
    }
    
    setWeekConfigs(updated);
  };

  const handleConfirm = async () => {
    // Validation
    if (!tourName.trim()) {
      toast.error('Please enter a tour name');
      return;
    }
    if (!segmentName.trim()) {
      toast.error('Please enter a segment name (e.g., France, Spain)');
      return;
    }
    if (!startDate) {
      toast.error('Please select a start date');
      return;
    }
    
    // Check each week has a city
    for (let i = 0; i < weekConfigs.length; i++) {
      const week = weekConfigs[i];
      if (!week.locationCity.trim()) {
        toast.error(`Please enter a city for Week ${i + 1}`);
        return;
      }
      const showCount = getShowCount(week);
      if (showCount < 2) {
        toast.error(`Week ${i + 1} must have at least 2 shows (currently has ${showCount})`);
        return;
      }
    }
    
    setIsSubmitting(true);
    
    // Clean up custom shows - only include enabled ones
    const cleanedWeeks = weekConfigs.map(week => ({
      ...week,
      customShows: week.isStandard ? undefined : week.customShows?.filter(s => s.enabled)
    }));
    
    toast.info('Creating tour segment...');
    onConfirm(tourName, segmentName, cleanedWeeks);
  };

  const getShowCount = (week: WeekConfig) => {
    if (week.isStandard) {
      // Standard week is 8 shows minus travel day
      return week.travelDay === 'none' ? 8 : 7;
    }
    return week.customShows?.filter(s => s.status === 'show' && s.enabled).length || 0;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Tour Weeks</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tourName">Tour Name</Label>
              <Input
                id="tourName"
                value={tourName}
                onChange={(e) => setTourName(e.target.value)}
                placeholder="e.g., European Summer Tour 2025"
              />
              <p className="text-xs text-gray-500 mt-1">Main tour name for grouping segments</p>
            </div>
            <div>
              <Label htmlFor="segmentName">Segment Name</Label>
              <Input
                id="segmentName"
                value={segmentName}
                onChange={(e) => setSegmentName(e.target.value)}
                placeholder="e.g., France, Spain, Germany"
              />
              <p className="text-xs text-gray-500 mt-1">Country or region for this segment</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="numberOfWeeks">Number of Weeks</Label>
              <Input
                id="numberOfWeeks"
                type="number"
                min="1"
                max="12"
                value={numberOfWeeks}
                onChange={(e) => setNumberOfWeeks(parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <Label htmlFor="startDate">Start Date (Monday)</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          {weekConfigs.length > 0 && (
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Week Configuration</h3>
              <div className="space-y-3">
                {weekConfigs.map((week, index) => (
                  <div key={index} className="border rounded p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span className="font-medium">
                          Week {week.weekNumber} ({format(new Date(week.startDate), 'MMM d')} - {format(new Date(week.endDate), 'MMM d')})
                        </span>
                        <span className="text-sm text-gray-500">
                          ({getShowCount(week)} shows)
                        </span>
                      </div>
                    </div>
                    
                    {/* City Input */}
                    <div className="mb-3">
                      <Label className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        City/Location for Week {week.weekNumber}
                      </Label>
                      <Input
                        value={week.locationCity}
                        onChange={(e) => handleLocationChange(index, e.target.value)}
                        placeholder={`e.g., Paris, Madrid, Berlin`}
                        className="mt-1"
                      />
                    </div>

                    {/* Travel Day Selection */}
                    <div className="mb-3">
                      <Label className="flex items-center gap-1">
                        <Plane className="w-3 h-3" />
                        Travel Day
                      </Label>
                      <Select 
                        value={week.travelDay} 
                        onValueChange={(value) => handleTravelDayChange(index, value)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No travel day</SelectItem>
                          <SelectItem value="monday">Monday</SelectItem>
                          <SelectItem value="tuesday">Tuesday</SelectItem>
                          <SelectItem value="wednesday">Wednesday</SelectItem>
                          <SelectItem value="thursday">Thursday</SelectItem>
                          <SelectItem value="friday">Friday</SelectItem>
                          <SelectItem value="saturday">Saturday</SelectItem>
                          <SelectItem value="sunday">Sunday</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Standard vs Custom */}
                    <RadioGroup
                      value={week.isStandard ? 'standard' : 'custom'}
                      onValueChange={(value) => handleWeekTypeChange(index, value === 'standard')}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="standard" id={`standard-${index}`} />
                        <Label htmlFor={`standard-${index}`}>
                          Standard week (8 shows, {week.travelDay !== 'none' ? `${week.travelDay} travel` : 'no travel'})
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="custom" id={`custom-${index}`} />
                        <Label htmlFor={`custom-${index}`}>Custom schedule</Label>
                      </div>
                    </RadioGroup>

                    {!week.isStandard && week.customShows && (
                      <div className="mt-3 pl-6">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedWeek(expandedWeek === index ? null : index)}
                        >
                          {expandedWeek === index ? 'Hide' : 'Show'} Custom Schedule
                        </Button>
                        
                        {expandedWeek === index && (
                          <div className="mt-2 space-y-1">
                            {week.customShows.map((show, showIndex) => (
                              <div key={showIndex} className="flex items-center gap-2">
                                <Checkbox
                                  checked={show.enabled}
                                  onCheckedChange={() => toggleCustomShow(index, showIndex)}
                                />
                                <span className={`text-sm ${!show.enabled ? 'line-through opacity-50' : ''}`}>
                                  {format(new Date(show.date), 'EEE MMM d')} - 
                                  {show.status === 'travel' ? ' Travel Day' : 
                                   show.status === 'dayoff' ? ' Day Off' :
                                   show.time === '15:00' ? ' Matinee (3:00 PM)' :
                                   show.time === '19:00' ? ' Evening (7:00 PM)' :
                                   ' Evening (8:00 PM)'}
                                </span>
                              </div>
                            ))}
                            <div className="text-xs text-gray-500 mt-1">
                              Total Shows: {week.customShows.filter(s => s.status === 'show' && s.enabled).length}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Back
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!tourName || !segmentName || weekConfigs.length === 0 || isSubmitting}
          >
            {isSubmitting ? 'Generating...' : 'Generate All Weeks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}