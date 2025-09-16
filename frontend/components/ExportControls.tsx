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

      const html = generateSimplePrintHTML();
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

  const exportToJSON = () => {
    try {
      const data = {
        location,
        week,
        shows,
        assignments,
        castMembers: castMembers.map(m => ({ name: m.name, eligibleRoles: m.eligibleRoles })),
        roles,
        exportedAt: new Date().toISOString()
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
        title: "Downloaded",
        description: "Schedule downloaded as JSON"
      });
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Download Failed",
        description: "Could not download schedule",
        variant: "destructive"
      });
    }
  };

  const copyToClipboard = async () => {
    try {
      let text = `STOMP ${location.toUpperCase()} WEEK ${week}\n`;
      text += '=' .repeat(text.length - 1) + '\n\n';

      // Header row with dates and times
      text += 'Role     | ';
      shows.forEach(show => {
        const dateStr = formatDate(show.date);
        const timeStr = show.status === 'show' ? formatTime(show.time) : show.status.toUpperCase();
        const callStr = show.status === 'show' ? `Call: ${formatCallTimeDisplay(show.callTime)}` : '';
        text += `${dateStr.padEnd(12)} | `;
      });
      text += '\n';

      text += '-'.repeat(8) + ' | ';
      shows.forEach(() => text += '-'.repeat(12) + ' | ');
      text += '\n';

      // Add time/call info row
      text += '         | ';
      shows.forEach(show => {
        if (show.status === 'show') {
          text += `${formatTime(show.time).padEnd(12)} | `;
        } else {
          text += `${show.status.toUpperCase().padEnd(12)} | `;
        }
      });
      text += '\n';

      text += '         | ';
      shows.forEach(show => {
        if (show.status === 'show') {
          text += `Call: ${formatCallTimeDisplay(show.callTime).padEnd(6)} | `;
        } else {
          text += '             | ';
        }
      });
      text += '\n\n';

      // Role assignments
      roles.forEach(role => {
        text += `${role.padEnd(8)} | `;
        shows.forEach(show => {
          if (show.status !== 'show') {
            text += `${show.status.toUpperCase().padEnd(12)} | `;
          } else {
            const assignment = assignments.find(a => a.showId === show.id && a.role === role);
            const performer = assignment?.performer || '';
            text += `${performer.padEnd(12)} | `;
          }
        });
        text += '\n';
      });

      text += '\n';

      // OFF section
      const maxOffCount = Math.max(
        ...shows
          .filter(show => show.status === 'show')
          .map(show => {
            const assignedPerformers = new Set(
              assignments
                .filter(a => a.showId === show.id && a.role !== "OFF")
                .map(a => a.performer)
                .filter(Boolean)
            );
            
            return castMembers
              .map(member => member.name)
              .filter(name => !assignedPerformers.has(name)).length;
          }),
        1
      );

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
          text += `${content.padEnd(12)} | `;
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

  const generateSimplePrintHTML = (): string => {
    // Group assignments by show and role
    const assignmentMap = new Map<string, string>();
    const redDayMap = new Map<string, boolean>();
    
    assignments.forEach(assignment => {
      const key = `${assignment.showId}-${assignment.role}`;
      assignmentMap.set(key, assignment.performer);
      if (assignment.isRedDay && assignment.performer) {
        redDayMap.set(`${assignment.showId}-${assignment.performer}`, true);
      }
    });

    const getAssignment = (showId: string, role: Role): string => {
      return assignmentMap.get(`${showId}-${role}`) || '';
    };

    const isRedDay = (showId: string, performer: string): boolean => {
      return redDayMap.get(`${showId}-${performer}`) || false;
    };

    const getOffPerformers = (showId: string): string[] => {
      const show = shows.find(s => s.id === showId);
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

    // Calculate max OFF count for consistent table structure
    const activeShowsForOff = shows.filter(show => show.status === 'show');
    const maxOffCount = Math.max(...activeShowsForOff.map(show => getOffPerformers(show.id).length), 1);

    // Build professional HTML table matching the exact STOMP format
    let tableHTML = `
      <div class="main-header">STOMP ${location.toUpperCase()} WEEK ${week}</div>
      
      <table class="schedule-table">
        <thead>
          <tr class="title-row">
            <th class="stomp-header">STOMP</th>`;

    // Date header cells with proper formatting
    shows.forEach(show => {
      const date = new Date(show.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
      const dayMonth = date.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' });
      
      tableHTML += `<th class="date-header"><strong>${dayName}<br>${dayMonth}</strong></th>`;
    });

    tableHTML += `</tr>
          <tr class="show-time-row">
            <th class="label-header"><strong>Show</strong></th>`;

    // Show time row
    shows.forEach(show => {
      if (show.status === 'show') {
        tableHTML += `<th class="time-cell"><strong>${formatTime(show.time)}</strong></th>`;
      } else {
        tableHTML += `<th class="special-time-cell"><strong>${show.status.toUpperCase()}</strong></th>`;
      }
    });

    tableHTML += `</tr>
          <tr class="call-time-row">
            <th class="label-header"><strong>Call</strong></th>`;

    // Call time row
    shows.forEach(show => {
      if (show.status === 'show') {
        tableHTML += `<th class="time-cell"><strong>${formatCallTimeDisplay(show.callTime)}</strong></th>`;
      } else {
        tableHTML += `<th class="special-time-cell"></th>`;
      }
    });

    tableHTML += `</tr>
          <tr class="separator-row">
            <th class="separator-cell"></th>`;
    
    shows.forEach(() => {
      tableHTML += `<th class="separator-cell"></th>`;
    });

    tableHTML += `</tr>
        </thead>
        <tbody>`;

    // Role assignment rows
    roles.forEach(role => {
      tableHTML += `<tr class="role-row">
        <td class="role-cell"><strong>${role}</strong></td>`;
      
      shows.forEach(show => {
        if (show.status !== 'show') {
          tableHTML += `<td class="special-cell">${show.status.toUpperCase()}</td>`;
        } else {
          const performer = getAssignment(show.id, role);
          const redDayClass = performer && isRedDay(show.id, performer) ? 'red-day' : '';
          tableHTML += `<td class="assignment-cell ${redDayClass}">${performer}</td>`;
        }
      });
      tableHTML += `</tr>`;
    });

    // Add black separator row before OFF section
    tableHTML += `<tr class="black-separator">
      <td class="black-separator-cell"></td>`;
    shows.forEach(() => {
      tableHTML += `<td class="black-separator-cell"></td>`;
    });
    tableHTML += `</tr>`;

    // Add empty spacing row
    tableHTML += `<tr class="spacing-row">
      <td class="spacing-cell"></td>`;
    shows.forEach(() => {
      tableHTML += `<td class="spacing-cell"></td>`;
    });
    tableHTML += `</tr>`;

    // OFF section rows
    for (let i = 0; i < maxOffCount; i++) {
      tableHTML += `<tr class="off-row">
        <td class="off-label-cell">${i === 0 ? '<strong>OFF</strong>' : ''}</td>`;
      
      shows.forEach(show => {
        if (show.status !== 'show') {
          tableHTML += `<td class="off-special-cell">N/A</td>`;
        } else {
          const offPerformers = getOffPerformers(show.id);
          const performer = offPerformers[i] || '';
          const redDayClass = performer && isRedDay(show.id, performer) ? 'red-day' : '';
          tableHTML += `<td class="off-cell ${redDayClass}">${performer}</td>`;
        }
      });
      tableHTML += `</tr>`;
    }

    // Add notes row
    tableHTML += `<tr class="notes-row">
      <td class="notes-label"><strong>NOTES</strong></td>
      <td colspan="${shows.length}" class="notes-content">***CALL TIME SUBJECT TO CHANGE***</td>
    </tr>`;

    tableHTML += `</tbody></table>`;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>STOMP Schedule</title>
    <style>
        @page {
            size: A4 landscape;
            margin: 0.4in;
        }
        
        body {
            font-family: Arial, sans-serif;
            font-size: 11px;
            margin: 0;
            padding: 0;
            line-height: 1.1;
        }
        
        .main-header {
            text-align: center;
            font-weight: bold;
            font-size: 16px;
            margin-bottom: 15px;
            padding: 10px 0;
        }
        
        .schedule-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            border: 2px solid #000;
            margin: 0;
        }
        
        .schedule-table th,
        .schedule-table td {
            border: 1px solid #000;
            padding: 4px 6px;
            text-align: center;
            vertical-align: middle;
            height: 20px;
        }
        
        /* Header styling - exact match to screenshot */
        .stomp-header {
            background-color: #000;
            color: white;
            font-weight: bold;
            font-size: 14px;
            text-align: left;
            padding-left: 8px;
            width: 80px;
        }
        
        .date-header {
            background-color: #c0c0c0;
            font-weight: bold;
            font-size: 11px;
            padding: 4px;
        }
        
        .label-header {
            background-color: #c0c0c0;
            font-weight: bold;
            font-size: 11px;
            text-align: left;
            padding-left: 8px;
            width: 80px;
        }
        
        .time-cell {
            background-color: #f0f0f0;
            font-weight: bold;
            font-size: 11px;
        }
        
        .special-time-cell {
            background-color: #f0f0f0;
            font-weight: bold;
            font-size: 11px;
        }
        
        .separator-cell {
            background-color: #f0f0f0;
            height: 8px;
            padding: 0;
            border-bottom: 1px solid #000;
        }
        
        /* Role cells */
        .role-cell {
            background-color: #e0e0e0;
            font-weight: bold;
            text-align: left;
            padding-left: 8px;
            width: 80px;
        }
        
        .assignment-cell {
            font-weight: normal;
            font-size: 11px;
            background-color: white;
        }
        
        .special-cell {
            background-color: #f0f0f0;
            font-style: normal;
            color: #000;
        }
        
        /* Black separator row */
        .black-separator-cell {
            background-color: #000;
            height: 6px;
            padding: 0;
            border: 1px solid #000;
        }
        
        /* Spacing row */
        .spacing-cell {
            background-color: white;
            height: 8px;
            padding: 0;
            border-left: 1px solid #000;
            border-right: 1px solid #000;
            border-top: none;
            border-bottom: none;
        }
        
        /* OFF section */
        .off-label-cell {
            background-color: #e0e0e0;
            font-weight: bold;
            text-align: left;
            padding-left: 8px;
            width: 80px;
        }
        
        .off-cell {
            font-weight: normal;
            font-size: 11px;
            background-color: white;
        }
        
        .off-special-cell {
            background-color: #f0f0f0;
            font-style: normal;
            color: #000;
        }
        
        /* Notes row */
        .notes-label {
            background-color: #e0e0e0;
            font-weight: bold;
            text-align: left;
            padding-left: 8px;
            width: 80px;
        }
        
        .notes-content {
            background-color: white;
            text-align: center;
            color: #0000ff;
            font-weight: bold;
            font-size: 11px;
        }
        
        /* RED day styling - CRITICAL */
        .red-day {
            color: #ff0000 !important;
            font-weight: normal !important;
            font-style: italic;
        }
        
        @media print {
            body { 
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .schedule-table {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
${tableHTML}
</body>
</html>
    `;
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