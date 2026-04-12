import { useEffect, useState } from 'react';
import { fetchRmpRating, type RmpResult } from '../api/client';

export interface ModalEventData {
  courseCode: string;
  component: string;
  sectionCode: string;
  instructor: string;
  start: Date;
  end: Date;
  dateStart: string;
  dateEnd: string;
}

interface Props {
  event: ModalEventData;
  onClose: () => void;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function RatingBadge({ rating, numRatings, url }: RmpResult) {
  if (rating === null) return <span className="text-gray-400 dark:text-gray-500 text-xs">No rating</span>;

  const color =
    rating >= 4   ? 'text-green-600 dark:text-green-400' :
    rating >= 3   ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-red-600 dark:text-red-400';

  return (
    <a
      href={url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-1 font-semibold text-sm hover:underline ${color}`}
      title={`${numRatings} rating${numRatings !== 1 ? 's' : ''} on Rate My Professor`}
    >
      ★ {rating.toFixed(1)}
      <span className="text-gray-400 dark:text-gray-500 font-normal text-xs">/ 5</span>
      <span className="text-gray-400 dark:text-gray-500 font-normal text-xs">({numRatings})</span>
    </a>
  );
}

export default function EventModal({ event, onClose }: Props) {
  const [rmp, setRmp] = useState<RmpResult | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    setRmp(null);
    fetchRmpRating(event.instructor).then(setRmp);
  }, [event.instructor]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-5 w-80 border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{event.courseCode}</h2>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{event.component}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-lg leading-none mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Details */}
        <div className="space-y-2.5">
          <Row label="Section" value={event.sectionCode} />

          {/* Instructor row with RMP rating */}
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-gray-400 dark:text-gray-500 shrink-0">Instructor</span>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-gray-800 dark:text-gray-200 text-right">{event.instructor}</span>
              {rmp === null
                ? <span className="text-gray-400 dark:text-gray-600 text-xs">Loading…</span>
                : <RatingBadge {...rmp} />
              }
            </div>
          </div>

          <Row label="Time" value={`${formatTime(event.start)} – ${formatTime(event.end)}`} />
          <Row label="Dates" value={
            event.dateStart === event.dateEnd
              ? formatDate(event.dateStart)
              : `${formatDate(event.dateStart)} – ${formatDate(event.dateEnd)}`
          } />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-400 dark:text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 dark:text-gray-200 text-right">{value}</span>
    </div>
  );
}
