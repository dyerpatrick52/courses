import FullCalendar from '@fullcalendar/react';
import type { CalendarApi } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { EventInput } from '@fullcalendar/core';
import type { FormattedSchedule } from '../api/types';
import { getCourseColor } from '../utils/colors';
import { fetchRmpRating, type RmpResult } from '../api/client';
import EventModal, { type ModalEventData } from './EventModal';
import {useState, useEffect, useRef} from 'react';

// maps the two-letter day abbreviations (from the API) to JS day-of-week numbers (0=Sun ... 6=Sat)
const DAY_MAP: Record<string, number> = {
  Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6,
};

// parses a "YYYY-MM-DD" string into a Date without timezone issues.
// new Date("2025-01-15") treats the string as UTC and shifts it to the local timezone,
// which can land on the wrong day. Using the three-argument constructor avoids that.
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d); // month is 0-indexed in JS (0=Jan, 11=Dec)
}

// turns the schedule object into a flat list of FullCalendar events.
// each meeting in the schedule becomes one or more calendar events depending on whether
// it's a single-day occurrence or a recurring weekly one.
function generateEvents(schedule: FormattedSchedule): EventInput[] {
  const events: EventInput[] = []; // start with an empty array we'll push into

  // Object.entries() turns the object into pairs of [key, value] — here [courseCode, course]
  for (const [courseCode, course] of Object.entries(schedule)) {
    for (const m of course.meetings) {
      // split "10:30" into ["10","30"], convert each to a number
      const [sh, sm] = m.start.split(':').map(Number); // sh = start hour, sm = start minute
      const [eh, em] = m.end.split(':').map(Number);   // eh = end hour,   em = end minute

      const color = getCourseColor(courseCode, m.component); // pick a consistent color for this course

      // group extra data we want accessible when the user clicks an event
      const props = {
        component:    m.component,
        section_code: m.section_code,
        instructor:   course.instructor,
        courseCode,
        date_start:   m.date_start,
        date_end:     m.date_end,
      };

      if (m.date_start === m.date_end) {
        // one-off meeting (exam, lab replacement, etc.) — only happens on a single date
        const date  = parseLocalDate(m.date_start);
        const start = new Date(date); start.setHours(sh, sm, 0, 0); // set time on a copy of the date
        const end   = new Date(date); end.setHours(eh, em, 0, 0);
        events.push({ title: courseCode, start, end, backgroundColor: color, borderColor: '#111827', extendedProps: props });
      } else {
        // recurring weekly meeting — find every occurrence between date_start and date_end
        const targetDay = DAY_MAP[m.day]; // e.g. "Tu" → 2 (JS day-of-week number)
        if (targetDay === undefined) continue; // skip if the day string isn't recognised

        const rangeEnd = parseLocalDate(m.date_end);
        const cursor   = parseLocalDate(m.date_start); // cursor walks forward one week at a time

        // advance cursor until it lands on the right weekday (e.g. skip Mon if we need Tue)
        while (cursor.getDay() !== targetDay) cursor.setDate(cursor.getDate() + 1);

        // now step forward 7 days at a time, adding one event per week
        while (cursor <= rangeEnd) {
          const start = new Date(cursor); start.setHours(sh, sm, 0, 0);
          const end   = new Date(cursor); end.setHours(eh, em, 0, 0);
          events.push({ title: courseCode, start, end, backgroundColor: color, borderColor: '#111827', extendedProps: props });
          cursor.setDate(cursor.getDate() + 7); // jump to next week
        }
      }
    }
  }

  return events;
}

// finds the earliest meeting date across all courses so we can scroll the calendar to the right week
function getInitialDate(schedule: FormattedSchedule): Date {
  let earliest: Date | null = null;
  for (const course of Object.values(schedule)) {
    for (const m of course.meetings) {
      const d = parseLocalDate(m.date_start);
      if (!earliest || d < earliest) earliest = d; // keep whichever is further in the past
    }
  }
  return earliest ?? new Date(); // fall back to today if schedule is empty
}

interface Props {
  schedule: FormattedSchedule | null;
  courseNames: Record<string, string>; // maps course code → full course title
}

export default function CalendarGrid({ schedule, courseNames }: Props) {
  const [modalEvent, setModalEvent] = useState<ModalEventData | null>(null); // which event is open in the popup
  const [ratings, setRatings] = useState<Map<string, RmpResult>>(new Map()); // RMP ratings keyed by instructor name
  const calendarRef = useRef<FullCalendar>(null); // ref lets us call the FullCalendar API imperatively

  // whenever the schedule changes, fetch RMP ratings for all instructors in it
  useEffect(() => {
    if (!schedule) return;
    // collect unique instructor names (filter(Boolean) removes empty strings)
    const instructors = [...new Set(Object.values(schedule).map(c => c.instructor).filter(Boolean))];
    setRatings(new Map()); // clear stale ratings while we wait
    // fetch all ratings in parallel, then convert the array of [name, rating] pairs into a Map
    Promise.all(instructors.map(name => fetchRmpRating(name).then(r => [name, r] as const)))
      .then(pairs => setRatings(new Map(pairs)));
  }, [schedule]);

  // whenever the schedule changes, jump the calendar to the first week that has classes
  useEffect(() => {
    if (!schedule || !calendarRef.current) return;
    const api: CalendarApi = calendarRef.current.getApi(); // grab the FullCalendar imperative API
    api.gotoDate(getInitialDate(schedule)); // FullCalendar ignores initialDate after first mount, so we do this manually
  }, [schedule]);

  if (!schedule) return null; // nothing to show yet

  const events      = generateEvents(schedule);
  const initialDate = getInitialDate(schedule);
  const isMobile = window.innerWidth < 768; // tailwind's `md` breakpoint

  // find the earliest start and latest end across all meetings so we can trim empty hours from the calendar
  let minMins = 7 * 60;  // default: show from 7:00
  let maxMins = 22 * 60; // default: show until 22:00
  for (const course of Object.values(schedule)) {
    for (const m of course.meetings) {
      const s = parseInt(m.start.split(':')[0]) * 60 + parseInt(m.start.split(':')[1]);
      const e = parseInt(m.end.split(':')[0]) * 60 + parseInt(m.end.split(':')[1]);
      if (s < minMins) minMins = s;
      if (e > maxMins) maxMins = e;
    }
  }
  // round down/up to the nearest hour and add a 30-minute buffer on each side
  minMins = Math.max(0,    Math.floor((minMins - 30) / 60) * 60);
  maxMins = Math.min(1440, Math.ceil((maxMins + 30) / 60) * 60);

  // FullCalendar's slotMinTime/slotMaxTime expects "HH:00:00" strings
  function toTimeStr(mins: number) {
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:00:00`;
  }

  return (
    <div className="h-full p-4">
      <div className="h-full">
      <FullCalendar
        plugins={[timeGridPlugin]}
        initialView={isMobile ? 'timeGridThreeDay' : 'timeGridWeek'} // 3-day on mobile so everything fits the screen
        views={{ timeGridThreeDay: { type: 'timeGrid', duration: { days: 3 } } }} // custom view definition
        initialDate={initialDate}
        firstDay={1} // start the week on Monday instead of Sunday
        allDaySlot={false} // hide the all-day row at the top
        slotMinTime={toTimeStr(minMins)}
        slotMaxTime={toTimeStr(maxMins)}
        slotDuration="00:30:00"        // each row represents 30 minutes
        slotLabelInterval="01:00:00"   // only show labels every 1 hour
        events={events}
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
        buttonText={{ prev: '← Prev Week', next: 'Next Week →', today: 'Today' }}
        dayHeaderFormat={isMobile ? { weekday: 'short' } : { weekday: 'short', month: 'numeric', day: 'numeric' }}
        eventContent={arg => renderEvent(arg, ratings, courseNames)} // custom event rendering function below
        height="100%"
        weekends={true}
        nowIndicator={true}  // shows a red line at the current time
        eventMinHeight={24}  // prevent tiny events from becoming invisible
        ref={calendarRef}
        eventClick={info => {
          // pull the extra data we stored in extendedProps and open the modal
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

      {/* only render the modal when an event has been clicked */}
      {modalEvent && (
        <EventModal event={modalEvent} onClose={() => setModalEvent(null)} />
      )}
      </div>
    </div>
  );
}

// renders the content inside each calendar event block.
// FullCalendar calls this for every event and uses whatever JSX we return.
function renderEvent(
  arg: { event: { title: string; extendedProps: Record<string, string>; startStr: string; endStr: string } },
  ratings: Map<string, RmpResult>,
  courseNames: Record<string, string>,
) {
  const { component, section_code, instructor } = arg.event.extendedProps;
  // startStr is an ISO string like "2025-01-15T10:30:00" — slice chars 11–16 to get "10:30"
  const startTime  = arg.event.startStr.slice(11, 16);
  const endTime    = arg.event.endStr.slice(11, 16);
  const rating     = ratings.get(instructor)?.rating ?? null; // null if the instructor has no RMP rating
  const courseName = courseNames?.[arg.event.title];          // full title like "Calculus I"
  return (
    <div className="p-0.5 overflow-hidden h-full flex flex-col cursor-pointer">
      <div className="font-semibold leading-tight truncate">{arg.event.title}</div>
      {/* only show the course name if we have it */}
      {courseName && <div className="opacity-75 truncate text-xs leading-tight">{courseName}</div>}
      <div className="opacity-85 truncate">{component} · {section_code}</div>
      <div className="opacity-70 truncate text-xs">
        {instructor}{rating !== null && <span className="opacity-90"> · ★ {rating.toFixed(1)}</span>}
      </div>
      <div className="opacity-70 text-xs mt-auto">{startTime}–{endTime}</div>
    </div>
  );
}
