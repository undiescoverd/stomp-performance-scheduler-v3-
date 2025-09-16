import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, Share } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import type { Show, Assignment, Role, CastMember } from '~backend/scheduler/types';
import { formatDate, formatTime } from '../utils/dateUtils';

interface ExportControlsProps {
  location: string;
  week: string;
  shows: Show[];
  assignments: Assignment[];
  castMembers: CastMember[];
  roles: Role[];
}

export function ExportControls({
  location,
  week,
  shows,
  assignments,
  castMembers,
  roles
}: ExportControlsProps) {
  const { toast } = useToast();

  // Format call time display for export
  const formatCallTimeDisplay = (callTime: string): string => {
    if (callTime === 'TBC') return 'TBC';
    return formatTime(callTime);
  };

  const exportToPDF = async () => {
    try {
      // Create a new window with the printable schedule
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Could not open print window');
      }

      const html = generatePrintHTML();
      printWindow.document.write(html);
      printWindow.document.close();
      
      // Wait for content to load, then print
      printWindow.onload = () => {
        printWindow.print();
      };

      toast({
        title: "Export Initiated",
        description: "Print dialog opened. Choose 'Save as PDF' to export."
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "Export Failed",
        description: "Could not generate PDF. Please try again.",
        variant: "destructive"
      });
    }
  };

  const generatePrintHTML = (): string => {
    // Group assignments by show and role
    const assignmentMap = new Map<string, string>();
    assignments.forEach(assignment => {
      const key = `${assignment.showId}-${assignment.role}`;
      assignmentMap.set(key, assignment.performer);
    });

    const getAssignment = (showId: string, role: Role): string => {
      return assignmentMap.get(`${showId}-${role}`) || '';
    };

    const getOffPerformers = (showId: string): string[] => {
      const show = shows.find(s => s.id === showId);
      if (show && show.status !== 'show') {
        return []; // No OFF list for travel/day off days
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

    const getRedDayIndicator = (showId: string, performer: string): string => {
      const show = shows.find(s => s.id === showId);
      const assignment = assignments.find(a => 
        a.showId === showId && a.performer === performer && a.isRedDay
      );
      return '';
    };

    // Generate table rows for roles
    const roleRows = roles.map(role => {
      const cells = shows.map(show => {
        if (show.status === 'travel') {
          return `<td class="special-day-cell travel">TRAVEL</td>`;
        } else if (show.status === 'dayoff') {
          return `<td class="special-day-cell dayoff">DAY OFF</td>`;
        } else {
          const performer = getAssignment(show.id, role);
          return `<td class="assignment-cell">${performer}</td>`;
        }
      }).join('');
      
      return `<tr><td class="role-cell">${role}</td>${cells}</tr>`;
    }).join('');

    // Generate OFF section
    const activeShowsForOff = shows.filter(show => show.status === 'show');
    const maxOffCount = Math.max(...activeShowsForOff.map(show => getOffPerformers(show.id).length), 1);
    
    const offRows = Array.from({ length: maxOffCount }, (_, index) => {
      const cells = shows.map(show => {
        if (show.status !== 'show') {
          return `<td class="off-cell special">N/A</td>`;
        }
        
        const offPerformers = getOffPerformers(show.id);
        const performer = offPerformers[index] || '';
        const redIndicator = performer ? getRedDayIndicator(show.id, performer) : '';
        const cellClass = redIndicator ? 'off-cell red-day' : 'off-cell';
        return `<td class="${cellClass}">${performer}${redIndicator}</td>`;
      }).join('');
      
      return `<tr><td class="off-label-cell">${index === 0 ? 'OFF' : ''}</td>${cells}</tr>`;
    }).join('');

    // Generate show headers
    const showHeaders = shows.map(show => {
      const statusLabel = show.status === 'travel' ? 'TRAVEL DAY' : 
                         show.status === 'dayoff' ? 'DAY OFF' : '';
      
      return `
        <td class="show-header ${show.status !== 'show' ? 'special-day' : ''}">
          <div class="show-date">${formatDate(show.date)}</div>
          ${show.status === 'show' ? `
            <div class="show-time">${formatTime(show.time)}</div>
            <div class="call-time">Call: ${formatCallTimeDisplay(show.callTime)}</div>
          ` : `
            <div class="special-status">${statusLabel}</div>
          `}
        </td>
      `;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>STOMP Schedule - ${location} Week ${week}</title>
    <style>
        @page {
            size: A4 landscape;
            margin: 0.5in;
        }
        
        body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.2;
            margin: 0;
            padding: 0;
        }
        
        .schedule-container {
            width: 100%;
            max-width: 100%;
        }
        
        .header {
            text-align: center;
            margin-bottom: 20px;
            font-weight: bold;
            font-size: 16px;
        }
        
        .divider {
            border-top: 2px solid #000;
            margin: 10px 0;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
        }
        
        th, td {
            border: 1px solid #333;
            padding: 4px 6px;
            text-align: center;
            vertical-align: middle;
        }
        
        .role-cell, .off-label-cell {
            background-color: #f5f5f5;
            font-weight: bold;
            text-align: left;
            width: 80px;
        }
        
        .show-header {
            background-color: #f0f0f0;
            font-weight: bold;
            min-width: 80px;
        }
        
        .show-header.special-day {
            background-color: #ffe6e6;
        }
        
        .show-date {
            font-weight: bold;
            margin-bottom: 2px;
        }
        
        .show-time {
            font-size: 10px;
            margin-bottom: 1px;
        }
        
        .call-time {
            font-size: 9px;
            color: #666;
        }
        
        .special-status {
            font-size: 10px;
            color: #d63031;
            font-weight: bold;
        }
        
        .assignment-cell {
            font-weight: bold;
            min-width: 60px;
        }
        
        .special-day-cell {
            font-weight: bold;
            min-width: 60px;
            font-size: 10px;
        }
        
        .special-day-cell.travel {
            background-color: #ffe6e6;
            color: #d63031;
        }
        
        .special-day-cell.dayoff {
            background-color: #f0f0f0;
            color: #636e72;
        }
        
        .off-cell {
            background-color: #f9f9f9;
            font-size: 10px;
            min-width: 60px;
        }
        
        .off-cell.special {
            background-color: #f0f0f0;
            color: #636e72;
            font-style: italic;
        }
        
        .off-cell.red-day {
            background-color: #ffebee;
            color: #c62828;
            font-weight: bold;
        }
        
        @media print {
            body { 
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="schedule-container">
        <div class="header">
            STOMP ${location.toUpperCase()} WEEK ${week}
        </div>
        
        <div class="divider"></div>
        
        <table>
            <thead>
                <tr>
                    <th style="width: 80px;"></th>
                    ${showHeaders}
                </tr>
            </thead>
            <tbody>
                ${roleRows}
                <tr><td colspan="${shows.length + 1}" class="divider"></td></tr>
                ${offRows}
            </tbody>
        </table>
        
        <div style="margin-top: 15px; font-size: 10px; color: #666;">
            <div style="margin-bottom: 5px;"><strong>Legend:</strong></div>
            <div style="margin-bottom: 3px;">• RED Day - Performer is not on call and cannot be called in for emergency cover unless compensated</div>
            <div>• TRAVEL/DAY OFF days show special status instead of individual assignments</div>
        </div>
    </div>
</body>
</html>`;
  };

  const exportToJSON = () => {
    const data = {
      location,
      week,
      shows,
      assignments,
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stomp-schedule-${location.toLowerCase().replace(/\s+/g, '-')}-week-${week}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "JSON Exported",
      description: "Schedule data downloaded as JSON file"
    });
  };

  const copyToClipboard = async () => {
    try {
      // Generate a simple text version for sharing
      let text = `STOMP ${location.toUpperCase()} WEEK ${week}\n`;
      text += '='.repeat(50) + '\n\n';

      // Add show headers
      text += 'Date     | ';
      shows.forEach(show => {
        text += `${formatDate(show.date).padEnd(8)} | `;
      });
      
      text += '\nStatus   | ';
      shows.forEach(show => {
        const status = show.status === 'travel' ? 'TRAVEL' : 
                      show.status === 'dayoff' ? 'DAY OFF' : 'SHOW';
        text += `${status.padEnd(8)} | `;
      });
      
      text += '\nShow     | ';
      shows.forEach(show => {
        const showTime = show.status === 'show' ? formatTime(show.time) : '-';
        text += `${showTime.padEnd(8)} | `;
      });
      
      text += '\nCall     | ';
      shows.forEach(show => {
        const callTime = show.status === 'show' ? formatCallTimeDisplay(show.callTime) : '-';
        text += `${callTime.padEnd(8)} | `;
      });
      text += '\n' + '-'.repeat(50) + '\n';

      // Add role assignments
      const assignmentMap = new Map<string, string>();
      assignments.forEach(assignment => {
        const key = `${assignment.showId}-${assignment.role}`;
        assignmentMap.set(key, assignment.performer);
      });

      roles.forEach(role => {
        text += `${role.padEnd(8)} | `;
        shows.forEach(show => {
          let content = '';
          if (show.status === 'travel') {
            content = 'TRAVEL';
          } else if (show.status === 'dayoff') {
            content = 'DAY OFF';
          } else {
            content = assignmentMap.get(`${show.id}-${role}`) || '';
          }
          text += `${content.padEnd(8)} | `;
        });
        text += '\n';
      });

      text += '-'.repeat(50) + '\n';

      // Add OFF section
      const activeShows = shows.filter(show => show.status === 'show');
      const maxOffCount = Math.max(...activeShows.map(show => {
        const assignedPerformers = new Set(
          assignments
            .filter(a => a.showId === show.id)
            .map(a => a.performer)
            .filter(Boolean)
        );
        
        return castMembers
          .map(member => member.name)
          .filter(name => !assignedPerformers.has(name)).length;
      }), 1);

      for (let i = 0; i < maxOffCount; i++) {
        text += `${i === 0 ? 'OFF' : '   '.padEnd(8)} | `;
        shows.forEach(show => {
          let content = '';
          if (show.status !== 'show') {
            content = 'N/A';
          } else {
            const assignedPerformers = new Set(
              assignments
                .filter(a => a.showId === show.id)
                .map(a => a.performer)
                .filter(Boolean)
            );
            
            const offPerformers = castMembers
              .map(member => member.name)
              .filter(name => !assignedPerformers.has(name));
            
            content = offPerformers[i] || '';
          }
          text += `${content.padEnd(8)} | `;
        });
        text += '\n';
      }

      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to Clipboard",
        description: "Schedule copied as formatted text"
      });
    } catch (error) {
      console.error('Copy failed:', error);
      toast({
        title: "Copy Failed",
        description: "Could not copy to clipboard",
        variant: "destructive"
      });
    }
  };

  if (shows.length === 0 || (assignments.length === 0 && shows.every(show => show.status === 'show'))) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Download className="h-5 w-5" />
          <span>Export & Share</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          <Button onClick={exportToPDF} className="flex items-center space-x-2">
            <FileText className="h-4 w-4" />
            <span>Export PDF</span>
          </Button>
          
          <Button variant="outline" onClick={exportToJSON} className="flex items-center space-x-2">
            <Download className="h-4 w-4" />
            <span>Download JSON</span>
          </Button>
          
          <Button variant="outline" onClick={copyToClipboard} className="flex items-center space-x-2">
            <Share className="h-4 w-4" />
            <span>Copy Text</span>
          </Button>
        </div>
        
        <p className="text-sm text-gray-600 mt-3">
          Export your schedule for distribution or backup. PDF format is ideal for printing and sharing with cast members.
        </p>
      </CardContent>
    </Card>
  );
}
