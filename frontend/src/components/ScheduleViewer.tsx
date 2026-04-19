import { useState, useMemo, useEffect } from 'react';
import type { FormattedSchedule } from '../api/types';
import CalendarGrid from './CalendarGrid';
import ScheduleStats from './ScheduleStats';
import { computeStats } from '../utils/scheduleStats';
import { exportIcs } from '../utils/exportIcs';

// the keys the user can sort schedules by
type SortKey = 'default' | 'fewest-days' | 'least-gap' | 'earliest-end' | 'latest-start';

interface Props {
  schedules: FormattedSchedule[];
  courseNames: Record<string, string>; // maps course code → full course title, passed down to the calendar
}

export default function ScheduleViewer({ schedules, courseNames }: Props) {
  const [index, setIndex] = useState(0);        // which schedule is currently shown (0-based)
  const [inputVal, setInputVal] = useState('1'); // the text in the number input (1-based for display)
  const [sortKey, setSortKey] = useState<SortKey>('default');

  // useMemo recomputes only when schedules or sortKey change, not on every render.
  // sorting creates a new array with [...schedules] so we don't mutate the original.
  const sortedSchedules = useMemo(() => {
    if (sortKey === 'default') return schedules;
    return [...schedules].sort((a, b) => {
      const sa = computeStats(a); // compute stats for schedule A
      const sb = computeStats(b); // compute stats for schedule B
      switch (sortKey) {
        case 'fewest-days':  return sa.activeDays - sb.activeDays;                          // fewer days first
        case 'least-gap':    return sa.longestGapMinutes - sb.longestGapMinutes;            // shorter gaps first
        case 'earliest-end': return sa.latestEnd.localeCompare(sb.latestEnd);               // earlier end times first
        case 'latest-start': return sb.earliestStart.localeCompare(sa.earliestStart);       // later start times first
      }
    });
  }, [schedules, sortKey]);

  // when the user changes the sort order, reset back to the first schedule
  useEffect(() => { setIndex(0); setInputVal('1'); }, [sortKey]);

  const total   = sortedSchedules.length;
  const current = sortedSchedules[index] ?? null; // the currently displayed schedule

  // clamps i within bounds and updates both the index and the display input
  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(total - 1, i));
    setIndex(clamped);
    setInputVal(String(clamped + 1)); // input is 1-based (shows "1" when index is 0)
  }

  // show a message if no schedules were generated (e.g. filters too strict)
  if (total === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-500">
        <span className="text-3xl">📭</span>
        <p className="text-sm">No valid schedules found. Try adjusting your filters.</p>
      </div>
    );
  }

  const stats = computeStats(current!); // compute stats for the schedule currently on screen

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Navigation bar */}
      <div className="schedule-nav-bar flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        {/* Row 1: navigation + export */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="flex items-center gap-1 px-2 h-8 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors text-xs shrink-0"
          >
            ← <span>Prev. Schedule</span>
          </button>

          {/* number input lets the user jump directly to a specific schedule number */}
          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
            <input
              type="number"
              min={1}
              max={total}
              value={inputVal}
              onChange={e => {
                setInputVal(e.target.value);
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n)) goTo(n - 1); // convert 1-based input to 0-based index
              }}
              className="w-10 bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-1 py-0.5 text-center text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:border-red-700"
            />
            <span className="whitespace-nowrap">/ {total}</span>
          </div>

          <button
            onClick={() => goTo(index + 1)}
            disabled={index === total - 1}
            className="flex items-center gap-1 px-2 h-8 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors text-xs shrink-0"
          >
            <span>Next Schedule</span> →
          </button>

          {/* Export buttons */}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => exportIcs(current!)} // triggers an .ics file download
              title="Export to calendar (.ics)"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xs font-medium"
            >
              ICS
            </button>
            <button
              onClick={() => window.print()} // browser's built-in print/save-as-PDF dialog
              title="Print / Save as PDF"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xs font-medium"
            >
              PDF
            </button>
          </div>
        </div>

        {/* Row 2 on mobile: sort dropdown full width */}
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="w-full sm:w-auto bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300 focus:outline-none focus:border-red-700"
        >
          <option value="default">Default order</option>
          <option value="fewest-days">Fewest days</option>
          <option value="least-gap">Least gap</option>
          <option value="earliest-end">Earliest end</option>
          <option value="latest-start">Latest start</option>
        </select>
      </div>

      {/* Stats bar — shows a summary row of info about the current schedule */}
      <ScheduleStats stats={stats} />

      {/* Calendar — takes up all remaining vertical space */}
      <div className="flex-1 min-h-0 overflow-y-hidden dark:bg-gray-950">
        <CalendarGrid schedule={current} courseNames={courseNames} />
      </div>
    </div>
  );
}
