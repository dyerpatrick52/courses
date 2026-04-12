import { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { EventInput } from '@fullcalendar/core';
import type { FormattedSchedule } from '../api/types';
import { getCourseColor } from '../utils/colors';
import { fetchRmpRating, type RmpResult } from '../api/client';
import EventModal, { type ModalEventData } from './EventModal';

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
      const props    = {
        component:    m.component,
        section_code: m.section_code,
        instructor:   course.instructor,
        courseCode,
        date_start:   m.date_start,
        date_end:     m.date_end,
      };

      if (m.date_start === m.date_end) {
        const date  = parseLocalDate(m.date_start);
        const start = new Date(date); start.setHours(sh, sm, 0, 0);
        const end   = new Date(date); end.setHours(eh, em, 0, 0);
        events.push({ title: courseCode, start, end, backgroundColor: color, borderColor: '#111827', extendedProps: props });
      } else {
        const targetDay = DAY_MAP[m.day];
        if (targetDay === undefined) continue;
        const rangeEnd  = parseLocalDate(m.date_end);
        const cursor    = parseLocalDate(m.date_start);
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
  const [modalEvent, setModalEvent] = useState<ModalEventData | null>(null);
  const [ratings, setRatings] = useState<Map<string, RmpResult>>(new Map());

  useEffect(() => {
    if (!schedule) return;
    const instructors = [...new Set(Object.values(schedule).map(c => c.instructor).filter(Boolean))];
    setRatings(new Map());
    Promise.all(instructors.map(name => fetchRmpRating(name).then(r => [name, r] as const)))
      .then(pairs => setRatings(new Map(pairs)));
  }, [schedule]);

  if (!schedule) return null;

  const events      = generateEvents(schedule);
  const initialDate = getInitialDate(schedule);

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
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
        dayHeaderFormat={{ weekday: 'short', month: 'numeric', day: 'numeric' }}
        eventContent={arg => renderEvent(arg, ratings)}
        height="100%"
        weekends={true}
        nowIndicator={true}
        eventMinHeight={24}
        eventClick={info => {
          const p = info.event.extendedProps;
          setModalEvent({
            courseCode:  p.courseCode,
            component:   p.component,
            sectionCode: p.section_code,
            instructor:  p.instructor,
            start:       info.event.start!,
            end:         info.event.end!,
            dateStart:   p.date_start,
            dateEnd:     p.date_end,
          });
        }}
      />
      {modalEvent && (
        <EventModal event={modalEvent} onClose={() => setModalEvent(null)} />
      )}
    </div>
  );
}

function renderEvent(
  arg: { event: { title: string; extendedProps: Record<string, string>; startStr: string; endStr: string } },
  ratings: Map<string, RmpResult>,
) {
  const { component, section_code, instructor } = arg.event.extendedProps;
  const startTime = arg.event.startStr.slice(11, 16);
  const endTime   = arg.event.endStr.slice(11, 16);
  const rating    = ratings.get(instructor)?.rating ?? null;
  return (
    <div className="p-0.5 overflow-hidden h-full flex flex-col cursor-pointer">
      <div className="font-semibold leading-tight truncate">{arg.event.title}</div>
      <div className="opacity-85 truncate">{component} · {section_code}</div>
      <div className="opacity-70 truncate text-xs">
        {instructor}{rating !== null && <span className="opacity-90"> · ★ {rating.toFixed(1)}</span>}
      </div>
      <div className="opacity-70 text-xs mt-auto">{startTime}–{endTime}</div>
    </div>
  );
}
