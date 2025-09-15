import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Wand2, RefreshCw, Car, Calendar, Plus, Edit3, RotateCcw } from 'lucide-react';
import type { Show, Assignment, Role, CastMember, DayStatus } from '~backend/scheduler/types';
import { formatTime, formatDate } from '../utils/dateUtils';
import backend from '~backend/client';
import { useToast } from '@/components/ui/use-toast';

interface ScheduleGridProps {
  shows: Show[];
  assignments: Assignment[];
  castMembers: CastMember[];
  roles: Role[];
  location: string;
  week?: string;
  scheduleId?: string;
  onAssignmentChange: (showId: string, role: Role, performer: string) => void;
  onShowStatusChange: (showId: string, status: DayStatus) => void;
  onShowChange: (showId: string, field: 'date' | 'time' | 'callTime', value: string) => void;
  onAddShow: () => void;
  onRemoveShow: (showId: string) => void;
  onClearAll: () => void;
  onAutoGenerate: () => void;
  isGenerating: boolean;
  onSave?: () => void;
  isSaving?: boolean;
  isEditing?: boolean;
  onAssignmentUpdate?: (assignments: Assignment[]) => void;
}

export function ScheduleGrid({
  shows,
  assignments,
  castMembers,
  roles,
  location,
  week,
  scheduleId,
  onAssignmentChange,
  onShowStatusChange,
  onShowChange,
  onAddShow,
  onRemoveShow,
  onClearAll,
  onAutoGenerate,
  isGenerating,
  onSave,
  isSaving = false,
  isEditing = false,
  onAssignmentUpdate
}: ScheduleGridProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const { toast } = useToast();

  const visibleShows = shows.filter(show => show.status === 'show' || show.status === 'travel' || show.status === 'dayoff');

  const { assignmentMap, performerRedDays } = useMemo(() => {
    const assignmentMap = new Map<string, string>();
    const performerRedDays = new Map<string, string>();
    
    assignments.forEach(assignment => {
      if (assignment.role !== "OFF") {
        const key = `${assignment.showId}-${assignment.role}`;
        assignmentMap.set(key, assignment.performer);
      } else if (assignment.isRedDay) {
        const show = shows.find(s => s.id === assignment.showId);
        if (show && !performerRedDays.has(assignment.performer)) {
          performerRedDays.set(assignment.performer, show.date);
        }
      }
    });
    return { assignmentMap, performerRedDays };
  }, [assignments, shows]);

  const getAssignment = (showId: string, role: Role): string => {
    return assignmentMap.get(`${showId}-${role}`) || '';
  };

  const getEligibleCast = (role: Role): CastMember[] => {
    return castMembers.filter(member => member.eligibleRoles.includes(role));
  };

  const getShowConflicts = (showId: string): string[] => {
    const showAssignments = assignments.filter(a => a.showId === showId && a.role !== "OFF");
    const performers = showAssignments.map(a => a.performer);
    const duplicates = performers.filter((performer, index) => 
      performer && performers.indexOf(performer) !== index
    );
    return [...new Set(duplicates)];
  };

  const getOffPerformers = (showId: string): string[] => {
    const show = visibleShows.find(s => s.id === showId);
    if (show && show.status !== 'show') {
      return [];
    }

    const assignedPerformers = new Set(
      assignments
        .filter(a => a.showId === showId && a.role !== "OFF")
        .map(a => a.performer)
        .filter(Boolean)
    );
    
    return castMembers
      .map(member => member.name)
      .filter(name => !assignedPerformers.has(name));
  };

  const hasConflict = (showId: string, role: Role, performer: string): boolean => {
    if (!performer) return false;
    const conflicts = getShowConflicts(showId);
    return conflicts.includes(performer);
  };

  const getWeekFromShows = (): string => {
    if (visibleShows.length === 0) return '';
    
    try {
      const firstShowDate = new Date(visibleShows[0].date);
      const startOfYear = new Date(firstShowDate.getFullYear(), 0, 1);
      const pastDaysOfYear = (firstShowDate.getTime() - startOfYear.getTime()) / 86400000;
      const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
      return weekNumber.toString();
    } catch (error) {
      return '';
    }
  };

  const handleDayStatusChange = (showId: string, newStatus: string) => {
    const show = visibleShows.find(s => s.id === showId);
    if (!show) return;

    if (newStatus === 'remove') {
      if (confirm('Are you sure you want to remove this day from the schedule?')) {
        onRemoveShow(showId);
      }
      return;
    }

    const hasAssignments = assignments.some(a => a.showId === showId && a.role !== "OFF");
    
    if (show.status === 'show' && newStatus !== 'show' && hasAssignments) {
      if (confirm('This will clear all cast assignments for this day. Continue?')) {
        onShowStatusChange(showId, newStatus as DayStatus);
      }
    } else {
      onShowStatusChange(showId, newStatus as DayStatus);
    }
  };

  const handleStartEdit = (cellId: string) => {
    setEditingCell(cellId);
  };

  const handleSaveEdit = (showId: string, field: 'date' | 'time' | 'callTime', value: string) => {
    onShowChange(showId, field, value);
    setEditingCell(null);
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
  };

  const handleToggleRedDay = async (date: string, performer: string) => {
    if (!scheduleId) {
      toast({
        title: "Error",
        description: "Cannot toggle RED day - schedule not saved yet",
        variant: "destructive"
      });
      return;
    }

    const showsOnDate = shows.filter(s => s.date === date && s.status === 'show');
    const performerAssignmentsOnDate = assignments.filter(a => 
        a.performer === performer && showsOnDate.some(s => s.id === a.showId)
    );
    if (performerAssignmentsOnDate.length > 0 && !performerAssignmentsOnDate.every(a => a.role === 'OFF')) {
        toast({
            title: "Invalid RED Day",
            description: `${performer} must be OFF for all shows on this day to set it as a RED day.`,
            variant: "destructive"
        });
        return;
    }

    try {
      const response = await backend.scheduler.toggleRedDay({
        id: scheduleId,
        date,
        performer
      });

      if (onAssignmentUpdate) {
        onAssignmentUpdate(response.assignments);
      }

      const isNowRed = response.assignments.some(a => a.performer === performer && a.isRedDay && shows.find(s => s.id === a.showId)?.date === date);
      
      toast({
        title: "Success",
        description: `${performer} is now ${isNowRed ? 'RED' : 'regular OFF'} for ${formatDate(date)}`,
      });
    } catch (error: any) {
      console.error('Failed to toggle RED day:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to toggle RED day status",
        variant: "destructive"
      });
    }
  };
  const handleBulkDateUpdate = (newStartDate: string) => {
    if (!newStartDate || visibleShows.length === 0) return;
    
    try {
      const startDate = new Date(newStartDate);
      visibleShows.forEach((show, index) => {
        const newDate = new Date(startDate);
        newDate.setDate(startDate.getDate() + index);
        
        const formattedDate = newDate.toISOString().split('T')[0];
        onShowChange(show.id, 'date', formattedDate);
      });
      
      toast({
        title: "Success",
        description: `Updated ${visibleShows.length} show dates starting from ${formatDate(newStartDate)}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update show dates",
        variant: "destructive"
      });
    }
  };

  const handleHardReset = () => {
    if (confirm('This will completely clear all assignments and generate a fresh schedule. This action cannot be undone. Continue?')) {
      onClearAll();
      setTimeout(() => {
        onAutoGenerate();
      }, 100);
    }
  };

  const renderEditableCell = (showId: string, field: 'date' | 'time' | 'callTime', value: string, displayValue: string) => {
    const cellId = `${showId}-${field}`;
    const isEditing = editingCell === cellId;

    if (isEditing) {
      return (
        <div className="flex items-center space-x-1">
          <Input
            type={field === 'date' ? 'date' : 'time'}
            defaultValue={value}
            className="text-xs h-6 w-full"
            autoFocus
            onBlur={(e) => handleSaveEdit(showId, field, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveEdit(showId, field, e.currentTarget.value);
              } else if (e.key === 'Escape') {
                handleCancelEdit();
              }
            }}
          />
        </div>
      );
    }

    return (
      <div 
        className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 rounded px-1 py-0.5 transition-colors relative group"
        onClick={() => handleStartEdit(cellId)}
      >
        {displayValue}
        <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-50 absolute -top-1 -right-1" />
      </div>
    );
  };

  const renderSpecialDayContent = (show: Show) => {
    if (show.status === 'travel') {
      return (
        <div className="flex flex-col items-center justify-center h-8 bg-red-50 border border-red-200 rounded text-red-700 font-bold text-xs">
          <Car className="h-3 w-3 mb-1" />
          <span>TRAVEL</span>
        </div>
      );
    } else if (show.status === 'dayoff') {
      return (
        <div className="flex flex-col items-center justify-center h-8 bg-gray-100 border border-gray-300 rounded text-gray-600 font-bold text-xs">
          <Calendar className="h-3 w-3 mb-1" />
          <span>DAY OFF</span>
        </div>
      );
    }
    return null;
  };

  const formatCallTimeDisplay = (callTime: string): string => {
    if (callTime === 'TBC') return 'TBC';
    return formatTime(callTime);
  };

  if (visibleShows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cast Schedule</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No shows scheduled yet</p>
          <Button onClick={onAddShow}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Show
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Cast Schedule</CardTitle>
          <div className="flex items-center space-x-2">
            {visibleShows.length > 0 && (
              <div className="flex items-center space-x-2 mr-4 px-3 py-1 bg-blue-50 rounded-lg border border-blue-200">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-700 font-medium">Start Date:</span>
                <Input
                  type="date"
                  value={visibleShows[0]?.date || ''}
                  onChange={(e) => handleBulkDateUpdate(e.target.value)}
                  className="text-xs h-7 w-36 border-blue-300 focus:border-blue-500 bg-white"
                />
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onAutoGenerate}
              disabled={isGenerating || visibleShows.filter(s => s.status === 'show').length === 0}
            >
              {isGenerating ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              Auto Generate
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleHardReset}
              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Hard Reset
            </Button>
            <Button variant="outline" size="sm" onClick={onClearAll}>
              Clear All
            </Button>
            <Button variant="outline" size="sm" onClick={onAddShow}>
              <Plus className="h-4 w-4 mr-2" />
              Add Show
            </Button>
            {onSave && (
              <Button onClick={onSave} disabled={isSaving}>
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <></>
                )}
                {isEditing ? 'Save Changes' : 'Create Schedule'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <div className="min-w-fit">
            <div className="text-center font-bold text-lg mb-4">
              STOMP - {location} - Week {week || getWeekFromShows()}
            </div>
            
            <div className="border-t-2 border-black mb-4"></div>

            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr>
                  <th className="border border-gray-300 p-2 bg-gray-50 w-24 text-left font-medium"></th>
                  {visibleShows.map((show) => (
                    <th key={`date-${show.id}`} className="border border-gray-300 p-2 bg-gray-50 text-center font-medium min-w-24">
                      {renderEditableCell(show.id, 'date', show.date, formatDate(show.date))}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="border border-gray-300 p-2 bg-gray-50 text-left font-medium text-sm">Status</th>
                  {visibleShows.map((show) => (
                    <th key={`status-${show.id}`} className="border border-gray-300 p-1 bg-gray-50">
                      <Select value={show.status} onValueChange={(value) => handleDayStatusChange(show.id, value)}>
                        <SelectTrigger className="text-xs h-7 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="show">Show</SelectItem>
                          <SelectItem value="travel">Travel Day</SelectItem>
                          <SelectItem value="dayoff">Day Off</SelectItem>
                          <SelectItem value="remove">Remove Day</SelectItem>
                        </SelectContent>
                      </Select>
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="border border-gray-300 p-2 bg-gray-50 text-left font-medium text-sm">Show</th>
                  {visibleShows.map((show) => (
                    <th key={`show-${show.id}`} className="border border-gray-300 p-2 bg-gray-50 text-center text-xs font-medium">
                      {show.status === 'show' ? renderEditableCell(show.id, 'time', show.time, formatTime(show.time)) : '-'}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="border border-gray-300 p-2 bg-gray-50 text-left font-medium text-sm">Call</th>
                  {visibleShows.map((show) => (
                    <th key={`call-${show.id}`} className="border border-gray-300 p-2 bg-gray-50 text-center text-xs text-gray-600">
                      {show.status === 'show' ? renderEditableCell(show.id, 'callTime', show.callTime, formatCallTimeDisplay(show.callTime)) : '-'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={visibleShows.length + 1} className="border-t-2 border-black h-1 p-0"></td></tr>
                {roles.map((role) => (
                  <tr key={role}>
                    <td className="border border-gray-300 p-2 bg-gray-50 font-medium text-sm">{role}</td>
                    {visibleShows.map((show) => {
                      if (show.status !== 'show') {
                        return <td key={`${role}-${show.id}`} className="border border-gray-300 p-1 text-center">{renderSpecialDayContent(show)}</td>;
                      }
                      const currentAssignment = getAssignment(show.id, role);
                      const hasError = hasConflict(show.id, role, currentAssignment);
                      const eligibleCast = getEligibleCast(role);
                      return (
                        <td key={`${role}-${show.id}`} className="border border-gray-300 p-1">
                          <Select value={currentAssignment || "none"} onValueChange={(value) => onAssignmentChange(show.id, role, value === "none" ? "" : value)}>
                            <SelectTrigger className={`text-xs h-8 w-full transition-all duration-200 ${
                              hasError 
                                ? 'border-red-500 bg-red-50 hover:border-red-600 shadow-sm' 
                                : currentAssignment && currentAssignment !== "none"
                                  ? 'border-blue-400 bg-blue-50 hover:border-blue-500 shadow-sm'
                                  : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
                            }`}>
                              <SelectValue 
                                placeholder="Select..." 
                                className={currentAssignment && currentAssignment !== "none" ? 'font-medium text-blue-900' : 'text-gray-500'}
                              />
                              {hasError && <AlertTriangle className="h-3 w-3 text-red-500 ml-1 flex-shrink-0" />}
                            </SelectTrigger>
                            <SelectContent className="z-50 max-h-40 overflow-y-auto">
                              <SelectItem value="none" className="text-gray-500 italic font-normal">
                                <span className="flex items-center space-x-2">
                                  <span className="w-2 h-2 bg-gray-300 rounded-full"></span>
                                  <span>None</span>
                                </span>
                              </SelectItem>
                              {eligibleCast.map((member) => (
                                <SelectItem key={member.name} value={member.name} className="font-medium hover:bg-blue-50">
                                  <span className="flex items-center space-x-2">
                                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                    <span>{member.name}</span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {assignments.length > 0 && (
                  <tr><td colSpan={visibleShows.length + 1} className="border-t-2 border-black h-1 p-0"></td></tr>
                )}
                {assignments.length > 0 && (() => {
                  const activeShows = visibleShows.filter(show => show.status === 'show');
                  const maxOffCount = Math.max(...activeShows.map(show => getOffPerformers(show.id).length), 0);
                  if (maxOffCount === 0) return null;
                  
                  return Array.from({ length: maxOffCount }, (_, index) => (
                    <tr key={`off-row-${index}`}>
                      <td className="border border-gray-300 p-2 bg-gray-50 font-medium text-sm">{index === 0 ? 'OFF' : ''}</td>
                      {visibleShows.map((show) => {
                        if (show.status !== 'show') {
                          return (
                            <td key={`off-${show.id}-${index}`} className="border border-gray-300 p-2 text-center">
                              <div className="text-xs bg-gray-100 rounded h-6 flex items-center justify-center"><span className="text-gray-500 italic">N/A</span></div>
                            </td>
                          );
                        }
                        const offPerformers = getOffPerformers(show.id);
                        const performer = offPerformers[index];
                        if (!performer) {
                          return <td key={`off-${show.id}-${index}`} className="border border-gray-300 p-2"></td>;
                        }
                        const isRedDay = performerRedDays.get(performer) === show.date;
                        return (
                          <td key={`off-${show.id}-${index}`} className="border border-gray-300 p-1 text-center">
                            <button
                              onClick={() => handleToggleRedDay(show.date, performer)}
                              disabled={!scheduleId}
                              className={`text-xs rounded h-6 w-full flex items-center justify-center transition-colors hover:bg-opacity-80 ${
                                isRedDay ? 'bg-red-100 text-red-700 font-bold hover:bg-red-200' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                              }`}
                              title={isRedDay ? 'RED Day - Not on call for entire day' : 'Regular OFF - On call'}
                            >
                              <span>{performer}</span>
                              {isRedDay && <span className="ml-1 text-red-600 font-bold text-xs">(R)</span>}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
            {performerRedDays.size > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-4 h-4 bg-red-100 border border-red-300 rounded flex items-center justify-center">
                    <span className="text-red-700 font-bold text-xs">R</span>
                  </div>
                  <span className="text-red-700 font-medium">RED Day</span>
                  <span className="text-red-600">- Performer is not on call and cannot be called in for emergency cover unless compensated</span>
                </div>
                <div className="text-xs text-red-600 mt-1">
                  Click any OFF performer to toggle between regular OFF (on call) and RED day (not on call)
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
