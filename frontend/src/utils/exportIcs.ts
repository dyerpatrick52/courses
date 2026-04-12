import type { FormattedSchedule } from '../api/types';

const DAY_MAP: Record<string, number> = {
  Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6,
};

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIcsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

export function exportIcs(schedule: FormattedSchedule): void {
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

      const occurrences: Date[] = [];

      if (m.date_start === m.date_end) {
        occurrences.push(parseLocalDate(m.date_start));
      } else {
        const targetDay = DAY_MAP[m.day];
        if (targetDay === undefined) continue;
        const rangeEnd = parseLocalDate(m.date_end);
        const cursor   = parseLocalDate(m.date_start);
        while (cursor.getDay() !== targetDay) cursor.setDate(cursor.getDate() + 1);
        while (cursor <= rangeEnd) {
          occurrences.push(new Date(cursor));
          cursor.setDate(cursor.getDate() + 7);
        }
      }

      for (const date of occurrences) {
        const start = new Date(date); start.setHours(sh, sm, 0, 0);
        const end   = new Date(date); end.setHours(eh, em, 0, 0);
        const uid   = `${courseCode}-${m.component}-${m.section_code}-${toIcsDate(start)}@uoscheduler`;

        lines.push(
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTART:${toIcsDate(start)}`,
          `DTEND:${toIcsDate(end)}`,
          `SUMMARY:${courseCode} - ${m.component}`,
          `DESCRIPTION:Section: ${m.section_code}\\nInstructor: ${course.instructor}`,
          'END:VEVENT',
        );
      }
    }
  }

  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'schedule.ics';
  a.click();
  URL.revokeObjectURL(url);
}
