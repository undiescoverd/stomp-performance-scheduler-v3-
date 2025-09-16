import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { Show, Assignment, Role, CastMember } from '~backend/scheduler/types';

interface PDFExportOptions {
  location: string;
  week: string;
  shows: Show[];
  assignments: Assignment[];
  castMembers: CastMember[];
  roles: Role[];
}

export class SchedulePDFExporter {
  private doc: jsPDF;
  private options: PDFExportOptions;
  
  constructor(options: PDFExportOptions) {
    this.doc = new jsPDF('landscape', 'mm', 'a4');
    this.options = options;
  }

  generate(): void {
    const { location, week, shows, assignments, castMembers, roles } = this.options;
    
    // 1. Simple header - STOMP LOCATION WEEK X
    this.addHeader();
    
    // 2. Main Schedule Grid with RED day highlighting
    this.addMainGrid();
    
    // 3. OFF Section with RED days clearly marked
    this.addOffSection();
    
    // 4. Simple legend
    this.addNotesSection();
    
    // 5. Simple footer with timestamp
    this.addFooter();
  }

  private addHeader(): void {
    const { location, week } = this.options;
    
    // Professional centered header matching the image format
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(0, 0, 0);
    
    const headerText = `STOMP ${location.toUpperCase()} WEEK ${week}`;
    this.doc.text(headerText, 148, 20, { align: 'center' });
    
    // Add professional border
    this.doc.setDrawColor(0, 0, 0);
    this.doc.setLineWidth(2);
    this.doc.line(15, 25, 282, 25);
  }


  private addMainGrid(): void {
    const { shows, assignments, roles } = this.options;
    
    // Create structured table data matching the exact format from the image
    const tableHead = [
      ['Role', ...shows.map(show => {
        const date = new Date(show.date);
        const dayName = format(date, 'EEE');
        const monthDay = format(date, 'M/d');
        return `${dayName} ${monthDay}`;
      })],
      ['', ...shows.map(show => {
        if (show.status === 'show') {
          const timeFormatted = this.formatTime(show.time);
          const callTime = this.formatCallTime(show.callTime);
          return `${timeFormatted}\nCall: ${callTime}`;
        } else {
          return show.status.toUpperCase();
        }
      })]
    ];
    
    // Build role assignment rows
    const tableData: any[][] = [];
    
    roles.forEach(role => {
      const row: any[] = [{
        content: role,
        styles: { fontStyle: 'bold', halign: 'left' }
      }];
      
      shows.forEach(show => {
        if (show.status !== 'show') {
          row.push({
            content: show.status.toUpperCase(),
            styles: { 
              fillColor: [240, 240, 240],
              fontStyle: 'bold'
            }
          });
        } else {
          const assignment = assignments.find(
            a => a.showId === show.id && a.role === role
          );
          
          if (assignment) {
            // Check if this is a RED day
            const isRedDay = assignment.isRedDay;
            
            row.push({
              content: assignment.performer,
              styles: isRedDay ? {
                textColor: [220, 20, 20], // RED day performers in red
                fontStyle: 'bold'
              } : {
                fontStyle: 'normal'
              }
            });
          } else {
            row.push('');
          }
        }
      });
      tableData.push(row);
    });
    
    // Generate the main table with professional styling
    autoTable(this.doc, {
      startY: 35,
      head: tableHead,
      body: tableData,
      theme: 'grid',
      styles: {
        cellPadding: 4,
        fontSize: 10,
        valign: 'middle',
        halign: 'center',
        lineColor: [0, 0, 0],
        lineWidth: 0.5,
        textColor: [0, 0, 0]
      },
      headStyles: {
        fillColor: [248, 248, 248],
        textColor: [0, 0, 0],
        fontSize: 10,
        fontStyle: 'bold',
        lineColor: [0, 0, 0],
        lineWidth: 0.8,
        halign: 'center',
        valign: 'middle'
      },
      bodyStyles: {
        fillColor: [255, 255, 255],
        lineColor: [0, 0, 0],
        lineWidth: 0.5
      },
      columnStyles: {
        0: { 
          fontStyle: 'bold', 
          halign: 'left', 
          cellWidth: 25,
          fillColor: [252, 252, 252]
        }
      },
      margin: { left: 15, right: 15 },
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.8
    });
  }

  private addOffSection(): void {
    const { shows, assignments, castMembers } = this.options;
    const currentY = (this.doc as any).lastAutoTable.finalY + 5;
    
    // Build OFF data with professional styling
    const offRows: any[][] = [];
    const activeShows = shows.filter(show => show.status === 'show');
    
    // Find maximum OFF performers for any show to determine rows needed
    const maxOffCount = Math.max(...activeShows.map(show => {
      const assignedPerformers = new Set(
        assignments
          .filter(a => a.showId === show.id && a.role !== 'OFF')
          .map(a => a.performer)
      );
      
      return castMembers
        .map(member => member.name)
        .filter(name => !assignedPerformers.has(name)).length;
    }), 1);
    
    // Create rows for OFF section
    for (let i = 0; i < maxOffCount; i++) {
      const row: any[] = [{
        content: i === 0 ? 'OFF' : '',
        styles: { 
          fontStyle: 'bold', 
          halign: 'left',
          fillColor: [252, 252, 252]
        }
      }];
      
      shows.forEach(show => {
        if (show.status !== 'show') {
          row.push({
            content: 'N/A',
            styles: { 
              fillColor: [240, 240, 240],
              fontStyle: 'italic'
            }
          });
        } else {
          const assignedPerformers = new Set(
            assignments
              .filter(a => a.showId === show.id && a.role !== 'OFF')
              .map(a => a.performer)
          );
          
          const offPerformers = castMembers
            .map(member => member.name)
            .filter(name => !assignedPerformers.has(name));
          
          const performer = offPerformers[i] || '';
          
          if (performer) {
            // Check if they have a RED day
            const hasRedDay = assignments.some(
              a => a.performer === performer && 
                   a.isRedDay && 
                   a.showId === show.id
            );
            
            row.push({
              content: performer,
              styles: hasRedDay ? {
                textColor: [220, 20, 20], // RED day performers in red
                fontStyle: 'bold'
              } : {
                fontStyle: 'normal'
              }
            });
          } else {
            row.push('');
          }
        }
      });
      offRows.push(row);
    }
    
    // Add OFF section with matching table styling
    autoTable(this.doc, {
      startY: currentY,
      body: offRows,
      theme: 'grid',
      styles: {
        cellPadding: 4,
        fontSize: 10,
        valign: 'middle',
        halign: 'center',
        lineColor: [0, 0, 0],
        lineWidth: 0.5,
        textColor: [0, 0, 0]
      },
      bodyStyles: {
        fillColor: [255, 255, 255],
        lineColor: [0, 0, 0],
        lineWidth: 0.5
      },
      columnStyles: {
        0: { 
          fontStyle: 'bold', 
          halign: 'left', 
          cellWidth: 25,
          fillColor: [252, 252, 252]
        }
      },
      margin: { left: 15, right: 15 },
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.8
    });
  }

  private formatTime(time: string): string {
    // Format time based on common STOMP patterns
    if (time === 'mat' || time === 'matinee') return 'Mat';
    if (time === 'eve' || time === 'evening') return 'Eve';
    if (time.includes(':')) return time; // Already formatted like "19:30"
    return time;
  }

  private formatCallTime(callTime: string): string {
    if (!callTime || callTime === 'TBC') return 'TBC';
    return callTime;
  }

  private addNotesSection(): void {
    const currentY = (this.doc as any).lastAutoTable.finalY + 12;
    
    // Professional legend section
    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(0, 0, 0);
    this.doc.text('Legend:', 20, currentY);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(60, 60, 60);
    
    // RED day explanation with bullet points
    this.doc.text('• RED Day - Performer is not on call and cannot be called in for emergency cover unless compensated', 20, currentY + 6);
    this.doc.text('• TRAVEL/DAY OFF days show special status instead of individual assignments', 20, currentY + 11);
  }

  private addFooter(): void {
    const pageHeight = this.doc.internal.pageSize.height;
    const { location, week } = this.options;
    
    this.doc.setFontSize(8);
    this.doc.setTextColor(120, 120, 120);
    
    // Professional footer with timestamp
    const timestamp = format(new Date(), "EEEE, MMMM d, yyyy 'at' h:mm a");
    this.doc.text(`${timestamp} STOMP Schedule - ${location} Week ${week}`, 148, pageHeight - 8, { align: 'center' });
  }

  download(filename?: string): void {
    const { location, week } = this.options;
    const defaultName = `STOMP_Schedule_${location.replace(/\s+/g, '_')}_Week${week}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    this.doc.save(filename || defaultName);
  }
}