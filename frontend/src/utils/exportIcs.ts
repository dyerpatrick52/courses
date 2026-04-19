import type { FormattedSchedule } from '../api/types';

// maps two-letter day abbreviations to JS day-of-week numbers (same as CalendarGrid)
const DAY_MAP: Record<string, number> = {
  Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6,
};

// parses "YYYY-MM-DD" into a local Date without timezone shifting
// (same issue as CalendarGrid — the three-argument constructor keeps the date local)
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// converts a Date into the ICS datetime format: "YYYYMMDDTHHmmSS" (no dashes, no colons)
function toIcsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

// generates and downloads an .ics calendar file for the given schedule.
// .ics is a standard format that works with Google Calendar, Apple Calendar, Outlook, etc.
export function exportIcs(schedule: FormattedSchedule): void {
  // build the file as an array of lines, then join them at the end
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UOScheduler//EN',
    'CALSCALE:GREGORIAN',
  ];

  for (const [courseCode, course] of Object.entries(schedule)) {
    for (const m of course.meetings) {
      const [sh, sm] = m.start.split(':').map(Number);
      const [eh, em] = m.end.split(':').map(Number);

      // collect all dates this meeting occurs on
      const occurrences: Date[] = [];

      if (m.date_start === m.date_end) {
        // single occurrence — just one date
        occurrences.push(parseLocalDate(m.date_start));
      } else {
        // recurring weekly — same logic as CalendarGrid: walk from start to end, one week at a time
        const targetDay = DAY_MAP[m.day];
        if (targetDay === undefined) continue;
        const rangeEnd = parseLocalDate(m.date_end);
        const cursor   = parseLocalDate(m.date_start);
        while (cursor.getDay() !== targetDay) cursor.setDate(cursor.getDate() + 1); // find first matching weekday
        while (cursor <= rangeEnd) {
          occurrences.push(new Date(cursor)); // clone cursor before mutating it
          cursor.setDate(cursor.getDate() + 7);
        }
      }

      // emit one VEVENT block per occurrence
      for (const date of occurrences) {
        const start = new Date(date); start.setHours(sh, sm, 0, 0);
        const end   = new Date(date); end.setHours(eh, em, 0, 0);
        // UID must be globally unique — combining course, component, section, and datetime achieves that
        const uid   = `${courseCode}-${m.component}-${m.section_code}-${toIcsDate(start)}@uoscheduler`;

        lines.push(
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTART:${toIcsDate(start)}`,
          `DTEND:${toIcsDate(end)}`,
          `SUMMARY:${courseCode} - ${m.component}`,
          `DESCRIPTION:Section: ${m.section_code}\\nInstructor: ${course.instructor}`, // \\n is a literal newline in ICS
          'END:VEVENT',
        );
      }
    }
  }

  lines.push('END:VCALENDAR');

  // create an in-memory file from the lines, trigger a download, then clean up the object URL
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' }); // ICS spec requires CRLF line endings
  const url  = URL.createObjectURL(blob); // creates a temporary browser URL pointing to the blob
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'schedule.ics';
  a.click(); // programmatically clicking the link triggers the download
  URL.revokeObjectURL(url); // release the memory now that the download has started
}
