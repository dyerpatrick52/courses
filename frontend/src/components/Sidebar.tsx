import { useState, useEffect, useRef } from 'react';
import type { Term, GenerateRequest } from '../api/types';
import { fetchTerms, fetchCourses } from '../api/client';
import type { ThemeMode } from '../utils/useTheme';

const THEME_ICON: Record<ThemeMode, string> = { system: '💻', light: '☀️', dark: '🌙' };
const THEME_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

interface Props {
  onGenerate: (req: GenerateRequest) => void;
  loading: boolean;
  error: string | null;
  themeMode: ThemeMode;
  onThemeCycle: () => void;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_LABELS: Record<string, string> = {
  Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun',
};

function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export default function Sidebar({ onGenerate, loading, error, themeMode, onThemeCycle }: Props) {
  const [terms, setTerms]                 = useState<Term[]>([]);
  const [termCode, setTermCode]           = useState(() => lsGet('termCode', ''));
  const [query, setQuery]                 = useState('');
  const [suggestions, setSuggestions]     = useState<string[]>([]);
  const [allCourses, setAllCourses]       = useState<string[]>([]);
  const [selectedCourses, setSelected]    = useState<string[]>(() => lsGet('selectedCourses', []));
  const [freeDays, setFreeDays]           = useState<string[]>(() => lsGet('freeDays', []));
  const [noB2B, setNoB2B]                 = useState(() => lsGet('noB2B', false));
  const [no3Row, setNo3Row]               = useState(() => lsGet('no3Row', false));
  const [earliestStart, setEarliestStart] = useState(() => lsGet('earliestStart', ''));
  const [latestEnd, setLatestEnd]         = useState(() => lsGet('latestEnd', ''));
  const inputRef = useRef<HTMLInputElement>(null);
  const prevTermCode = useRef<string | null>(null);

  useEffect(() => { localStorage.setItem('termCode',        JSON.stringify(termCode));       }, [termCode]);
  useEffect(() => { localStorage.setItem('selectedCourses', JSON.stringify(selectedCourses)); }, [selectedCourses]);
  useEffect(() => { localStorage.setItem('freeDays',        JSON.stringify(freeDays));        }, [freeDays]);
  useEffect(() => { localStorage.setItem('noB2B',           JSON.stringify(noB2B));           }, [noB2B]);
  useEffect(() => { localStorage.setItem('no3Row',          JSON.stringify(no3Row));           }, [no3Row]);
  useEffect(() => { localStorage.setItem('earliestStart',   JSON.stringify(earliestStart));   }, [earliestStart]);
  useEffect(() => { localStorage.setItem('latestEnd',       JSON.stringify(latestEnd));        }, [latestEnd]);

  useEffect(() => {
    fetchTerms().then(t => {
      setTerms(t);
      if (t.length > 0 && !termCode) setTermCode(t[0].term_code);
    });
  }, []);

  useEffect(() => {
    if (!termCode) return;
    // Only clear selected courses when the user actively switches terms, not on initial load
    if (prevTermCode.current !== null && prevTermCode.current !== termCode) {
      setAllCourses([]);
      setSelected([]);
    }
    prevTermCode.current = termCode;
    fetch('/api/subjects').then(r => r.json()).then(async (subjects: { subject_code: string }[]) => {
      const results: string[] = [];
      await Promise.all(subjects.map(async s => {
        try {
          const courses = await fetchCourses(s.subject_code);
          results.push(...courses.map((c: { course_code: string }) => c.course_code));
        } catch { /* subject may have no courses */ }
      }));
      setAllCourses(results.sort());
    });
  }, [termCode]);

  function handleQueryChange(val: string) {
    setQuery(val);
    if (!val.trim()) { setSuggestions([]); return; }
    const q = val.toUpperCase();
    setSuggestions(allCourses.filter(c => c.toUpperCase().includes(q)).slice(0, 8));
  }

  function clearCourses() { setSelected([]); }

  function addCourse(code: string) {
    if (!selectedCourses.includes(code)) setSelected(prev => [...prev, code]);
    setQuery('');
    setSuggestions([]);
    inputRef.current?.focus();
  }

  function removeCourse(code: string) {
    setSelected(prev => prev.filter(c => c !== code));
  }

  function toggleDay(day: string) {
    setFreeDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  function handleGenerate() {
    const req: GenerateRequest = {
      term_code: termCode,
      courses: selectedCourses,
      filters: {
        ...(freeDays.length && { free_days: freeDays }),
        ...(noB2B && { no_back_to_back: true }),
        ...(no3Row && { no_three_in_row: true }),
        ...(earliestStart && { earliest_start: earliestStart }),
        ...(latestEnd && { latest_end: latestEnd }),
      },
    };
    onGenerate(req);
  }

  return (
    <div className="dark-scroll w-72 shrink-0 h-full flex flex-col bg-gray-100 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 overflow-y-auto shadow-xl">

      {/* Branding */}
      <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'var(--accent)' }}>
            U
          </div>
          <span className="text-gray-900 dark:text-white font-semibold text-sm tracking-tight">UOScheduler</span>
        </div>
        <button
          onClick={onThemeCycle}
          className="ml-auto text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-xs flex items-center gap-1"
          title={`Theme: ${THEME_LABEL[themeMode]}`}
        >
          <span>{THEME_ICON[themeMode]}</span>
          <span className="text-gray-500">{THEME_LABEL[themeMode]}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

        {/* Term selector */}
        <Card label="Term">
          <select
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-red-700"
            value={termCode}
            onChange={e => setTermCode(e.target.value)}
          >
            {terms.map(t => (
              <option key={t.term_code} value={t.term_code}>{t.term_name}</option>
            ))}
          </select>
        </Card>

        {/* Course search */}
        <Card label="Courses" action={selectedCourses.length > 0 ? (
          <button onClick={clearCourses} className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
            Clear all
          </button>
        ) : undefined}>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-red-700"
              placeholder="Search e.g. CSI 3104"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && suggestions.length > 0) addCourse(suggestions[0]);
              }}
            />
            {suggestions.length > 0 && (
              <ul className="absolute z-20 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-xl mt-1 max-h-40 overflow-y-auto">
                {suggestions.map(s => (
                  <li
                    key={s}
                    className="px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer first:rounded-t-md last:rounded-b-md"
                    onMouseDown={() => addCourse(s)}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-1.5 space-y-1">
            {selectedCourses.length === 0 && (
              <p className="text-sm text-gray-600 italic">No courses added yet.</p>
            )}
            {selectedCourses.map(c => (
              <div key={c} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-sm text-gray-800 dark:text-gray-200">
                <span className="font-medium">{c}</span>
                <button className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-2" onClick={() => removeCourse(c)}>✕</button>
              </div>
            ))}
          </div>
        </Card>

        {/* Days off */}
        <Card label="Days Off">
          <div className="flex flex-wrap gap-1">
            {DAYS.map(d => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={`px-2 py-0.5 rounded text-sm font-medium transition-colors ${
                  freeDays.includes(d)
                    ? 'text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                style={freeDays.includes(d) ? { background: 'var(--accent)' } : {}}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
        </Card>

        {/* Time constraints */}
        <Card label="Time Constraints">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">Earliest start</span>
              <input
                type="text"
                className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-red-700 w-20 text-center"
                placeholder="HH:MM"
                value={earliestStart}
                onChange={e => setEarliestStart(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">Latest end</span>
              <input
                type="text"
                className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-red-700 w-20 text-center"
                placeholder="HH:MM"
                value={latestEnd}
                onChange={e => setLatestEnd(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Preferences */}
        <Card label="Preferences">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={noB2B} onChange={e => setNoB2B(e.target.checked)} className="accent-red-700 w-3 h-3" />
              <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">No back-to-back classes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={no3Row} onChange={e => setNo3Row(e.target.checked)} className="accent-red-700 w-3 h-3" />
              <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">No three classes in a row</span>
            </label>
          </div>
        </Card>

        {error && (
          <div className="bg-red-950 border border-red-800 rounded-md px-2.5 py-1.5 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Generate button */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800">
        <button
          onClick={handleGenerate}
          disabled={loading || selectedCourses.length === 0}
          className="w-full text-white font-semibold rounded-lg py-2 text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg mt-0"
          style={{ background: loading || selectedCourses.length === 0 ? '#374151' : 'var(--accent)' }}
        >
          {loading ? 'Generating…' : 'Generate Schedules'}
        </button>
      </div>
    </div>
  );
}

function Card({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{label}</p>
        {action}
      </div>
      {children}
    </div>
  );
}
