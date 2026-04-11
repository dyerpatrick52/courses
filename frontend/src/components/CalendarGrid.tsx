import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { EventInput } from '@fullcalendar/core';
import type { FormattedSchedule } from '../api/types';
import { getCourseColor } from '../utils/colors';

const DAY_MAP: Record<string, number> = {
  Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6,
};

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function generateEvents(schedule: FormattedSchedule): EventInput[] {
  const events: EventInput[] = [];

  for (const [courseCode, course] of Object.entries(schedule)) {
    for (const m of course.meetings) {
      const [sh, sm] = m.start.split(':').map(Number);
      const [eh, em] = m.end.split(':').map(Number);
      const color    = getCourseColor(courseCode, m.component);
      const props    = { component: m.component, section_code: m.section_code, instructor: course.instructor, courseCode };

      if (m.date_start === m.date_end) {
        // Single occurrence — use the date directly
        const date  = parseLocalDate(m.date_start);
        const start = new Date(date); start.setHours(sh, sm, 0, 0);
        const end   = new Date(date); end.setHours(eh, em, 0, 0);
        events.push({ title: courseCode, start, end, backgroundColor: color, borderColor: '#111827', extendedProps: props });
      } else {
        // Weekly recurring — generate one event per week
        const targetDay  = DAY_MAP[m.day];
        if (targetDay === undefined) continue;
        const rangeEnd   = parseLocalDate(m.date_end);
        const cursor     = parseLocalDate(m.date_start);
        while (cursor.getDay() !== targetDay) cursor.setDate(cursor.getDate() + 1);
        while (cursor <= rangeEnd) {
          const start = new Date(cursor); start.setHours(sh, sm, 0, 0);
          const end   = new Date(cursor); end.setHours(eh, em, 0, 0);
          events.push({ title: courseCode, start, end, backgroundColor: color, borderColor: '#111827', extendedProps: props });
          cursor.setDate(cursor.getDate() + 7);
        }
      }
    }
  }

  return events;
}

function getInitialDate(schedule: FormattedSchedule): Date {
  let earliest: Date | null = null;
  for (const course of Object.values(schedule)) {
    for (const m of course.meetings) {
      const d = parseLocalDate(m.date_start);
      if (!earliest || d < earliest) earliest = d;
    }
  }
  return earliest ?? new Date();
}

interface Props {
  schedule: FormattedSchedule | null;
}

export default function CalendarGrid({ schedule }: Props) {
  if (!schedule) return null;

  const events = generateEvents(schedule);
  const initialDate = getInitialDate(schedule);

  // Compute time range from actual meetings, with 30-min padding, floored/ceiled to hour
  let minMins = 7 * 60;
  let maxMins = 22 * 60;
  for (const course of Object.values(schedule)) {
    for (const m of course.meetings) {
      const s = parseInt(m.start.split(':')[0]) * 60 + parseInt(m.start.split(':')[1]);
      const e = parseInt(m.end.split(':')[0]) * 60 + parseInt(m.end.split(':')[1]);
      if (s < minMins) minMins = s;
      if (e > maxMins) maxMins = e;
    }
  }
  // Floor start to hour, ceil end to next hour, add 30-min padding
  minMins = Math.max(0,    Math.floor((minMins - 30) / 60) * 60);
  maxMins = Math.min(1440, Math.ceil((maxMins + 30) / 60) * 60);

  function toTimeStr(mins: number) {
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:00:00`;
  }

  return (
    <div className="h-full p-4">
      <FullCalendar
        plugins={[timeGridPlugin]}
        initialView="timeGridWeek"
        initialDate={initialDate}
        firstDay={0}
        allDaySlot={false}
        slotMinTime={toTimeStr(minMins)}
        slotMaxTime={toTimeStr(maxMins)}
        slotDuration="00:30:00"
        slotLabelInterval="01:00:00"
        events={events}
        headerToolbar={{
          left:   'prev,next today',
          center: 'title',
          right:  '',
        }}
        dayHeaderFormat={{ weekday: 'short', month: 'numeric', day: 'numeric' }}
        eventContent={renderEvent}
        height="100%"
        weekends={true}
        nowIndicator={true}
        eventMinHeight={24}
      />
    </div>
  );
}

function renderEvent(arg: { event: { title: string; extendedProps: Record<string, string>; startStr: string; endStr: string } }) {
  const { component, section_code, instructor } = arg.event.extendedProps;
  const startTime = arg.event.startStr.slice(11, 16);
  const endTime   = arg.event.endStr.slice(11, 16);
  return (
    <div className="p-0.5 overflow-hidden h-full flex flex-col">
      <div className="font-semibold leading-tight truncate">{arg.event.title}</div>
      <div className="opacity-85 truncate">{component} · {section_code}</div>
      <div className="opacity-70 truncate text-xs">{instructor}</div>
      <div className="opacity-70 text-xs mt-auto">{startTime}–{endTime}</div>
    </div>
  );
}
