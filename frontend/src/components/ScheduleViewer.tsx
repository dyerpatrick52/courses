import { useState } from 'react';
import type { FormattedSchedule } from '../api/types';
import CalendarGrid from './CalendarGrid';
import ScheduleStats from './ScheduleStats';
import { computeStats } from '../utils/scheduleStats';
import { exportIcs } from '../utils/exportIcs';

interface Props {
  schedules: FormattedSchedule[];
}

export default function ScheduleViewer({ schedules }: Props) {
  const [index, setIndex] = useState(0);
  const [inputVal, setInputVal] = useState('1');

  const total   = schedules.length;
  const current = schedules[index] ?? null;

  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(total - 1, i));
    setIndex(clamped);
    setInputVal(String(clamped + 1));
  }

  if (total === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-500">
        <span className="text-3xl">📭</span>
        <p className="text-sm">No valid schedules found. Try adjusting your filters.</p>
      </div>
    );
  }

  const stats = computeStats(current!);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Navigation bar */}
      <div className="schedule-nav-bar flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        <button
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors text-sm"
        >
          ←
        </button>

        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
          <input
            type="number"
            min={1}
            max={total}
            value={inputVal}
            onChange={e => {
              setInputVal(e.target.value);
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n)) goTo(n - 1);
            }}
            className="w-12 bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-1.5 py-0.5 text-center text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:border-red-700"
          />
          <span>/ {total} schedules</span>
        </div>

        <button
          onClick={() => goTo(index + 1)}
          disabled={index === total - 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors text-sm"
        >
          →
        </button>

        {/* Export buttons */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => exportIcs(current!)}
            title="Export to calendar (.ics)"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xs font-medium"
          >
            ICS
          </button>
          <button
            onClick={() => window.print()}
            title="Print / Save as PDF"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xs font-medium"
          >
            PDF
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <ScheduleStats stats={stats} />

      {/* Calendar */}
      <div className="flex-1 min-h-0 overflow-hidden dark:bg-gray-950">
        <CalendarGrid schedule={current} />
      </div>
    </div>
  );
}
