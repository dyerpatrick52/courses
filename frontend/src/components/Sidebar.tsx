import { useState, useEffect, useRef } from 'react';
import type { Term, GenerateRequest } from '../api/types';
import { fetchTerms, fetchCourses } from '../api/client';
import type { ThemeMode } from '../utils/useTheme';

// lookup tables for the theme toggle button
const THEME_ICON: Record<ThemeMode, string> = { system: '💻', light: '☀️', dark: '🌙' };
const THEME_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

interface Props {
    onGenerate: (req: GenerateRequest) => void;
    loading: boolean;
    error: string | null;
    themeMode: ThemeMode;
    onThemeCycle: () => void;
    availableSections: Record<string, string[]>; // course code → available section letters (computed by App)
    isOpen: boolean;   // controls the mobile drawer open/close state
    onClose: () => void;
    courseDateRanges: Record<string, { start: string; end: string }>; // used to show session dates under each chip
    onCourseNamesChange: (names: Record<string, string>) => void; // called whenever course names are loaded
  }

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_LABELS: Record<string, string> = {
  Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun',
};

// safely reads a value from localStorage and parses it as JSON.
// returns the fallback if the key doesn't exist or parsing fails (e.g. corrupted data).
function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
}

// reads filter state from the URL query string so users can share/bookmark their selections.
// e.g. ?term=2251&course=MAT1320&course=PHY1321&noB2B=1
function parseUrlParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    termCode:      p.get('term'),
    courses:       p.getAll('course'),       // getAll returns an array (handles multiple ?course= params)
    freeDays:      p.get('freeDays')?.split(',').filter(Boolean) ?? null,
    noB2B:         p.has('noB2B') ? p.get('noB2B') === '1' : null,
    no3Row:        p.has('no3Row') ? p.get('no3Row') === '1' : null,
    earliestStart: p.get('earliest'),
    latestEnd:     p.get('latest'),
  };
}

// builds a shareable URL query string from the current generate request.
// only includes params that are actually set (the && short-circuit skips falsy values).
function buildUrl(req: GenerateRequest): string {
  const p = new URLSearchParams();
  p.set('term', req.term_code);
  req.courses.forEach(c => p.append('course', c)); // append creates multiple ?course= entries
  req.filters?.free_days?.length   && p.set('freeDays', req.filters.free_days.join(','));
  req.filters?.no_back_to_back     && p.set('noB2B', '1');
  req.filters?.no_three_in_row     && p.set('no3Row', '1');
  req.filters?.earliest_start      && p.set('earliest', req.filters.earliest_start);
  req.filters?.latest_end          && p.set('latest', req.filters.latest_end);
  return '?' + p.toString();
}

// converts a loose time string into a proper "HH:MM" format on blur.
// handles inputs like "900" → "09:00", "1030" → "10:30", "8" → "08:00"
function normalizeTime(val: string): string {
  const digits = val.replace(/\D/g, ''); // strip everything that isn't a digit
  if (!digits) return val;               // return as-is if there's nothing to work with
  if (digits.length <= 2) return `${digits.padStart(2, '0')}:00`;     // "9" → "09:00"
  if (digits.length === 3) return `${digits[0].padStart(2, '0')}:${digits.slice(1)}`.replace(/^(\d)/, '0$1'); // "930" → "09:30"
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`; // "1030" → "10:30"
}

// formats a date range for display under course chips (e.g. "Jan 6 – Apr 14")
function formatDateRange(start: string, end: string): string {
    // adding T12:00:00 forces the date to be interpreted as local noon, avoiding off-by-one-day errors
    const fmt = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  }

// parse URL params once at module load time (not inside the component) so they're stable references
const URL_PARAMS = parseUrlParams();

export default function Sidebar({ onGenerate, loading, error, themeMode, onThemeCycle, availableSections, isOpen, onClose, courseDateRanges, onCourseNamesChange }: Props) {
  const [terms, setTerms]                 = useState<Term[]>([]);
  // initialize each state from URL params first, falling back to localStorage, then to a default value
  const [termCode, setTermCode]           = useState(() => URL_PARAMS.termCode      ?? lsGet('termCode', ''));
  const [query, setQuery]                 = useState('');           // the course search input text
  const [suggestions, setSuggestions]     = useState<string[]>([]); // dropdown results for the search
  const [allCourses, setAllCourses]       = useState<string[]>([]); // full list of course codes for the selected term
  const [selectedCourses, setSelected]    = useState<string[]>(() => URL_PARAMS.courses.length > 0 ? URL_PARAMS.courses : lsGet('selectedCourses', []));
  const [freeDays, setFreeDays]           = useState<string[]>(() => URL_PARAMS.freeDays      ?? lsGet('freeDays', []));
  const [noB2B, setNoB2B]                 = useState(() => URL_PARAMS.noB2B         ?? lsGet('noB2B', false));
  const [no3Row, setNo3Row]               = useState(() => URL_PARAMS.no3Row        ?? lsGet('no3Row', false));
  const [earliestStart, setEarliestStart] = useState(() => URL_PARAMS.earliestStart ?? lsGet('earliestStart', ''));
  const [latestEnd, setLatestEnd]         = useState(() => URL_PARAMS.latestEnd     ?? lsGet('latestEnd', ''));
  const [allowedSections, setAllowedSections] = useState<Record<string, string[]>>({}); // which sections the user has toggled on
  const [courseNames, setCourseNames]         = useState<Record<string, string>>({});   // code → full title
  const [blockedTimes, setBlockedTimes]       = useState<{ day: string; start: string; end: string }[]>([]); // "Time Off" entries
  const [copied, setCopied]               = useState(false); // true briefly after the user copies the share link
  const inputRef = useRef<HTMLInputElement>(null);       // ref to the search input so we can re-focus it after adding a course
  const prevTermCode = useRef<string | null>(null);      // tracks the previous term so we know when the user actively switches
  const didAutoGenerate = useRef(false);                 // prevents the auto-generate from firing more than once

  // persist each filter value to localStorage whenever it changes
  useEffect(() => { localStorage.setItem('termCode',        JSON.stringify(termCode));       }, [termCode]);
  useEffect(() => { localStorage.setItem('selectedCourses', JSON.stringify(selectedCourses)); }, [selectedCourses]);
  useEffect(() => { localStorage.setItem('freeDays',        JSON.stringify(freeDays));        }, [freeDays]);
  useEffect(() => { localStorage.setItem('noB2B',           JSON.stringify(noB2B));           }, [noB2B]);
  useEffect(() => { localStorage.setItem('no3Row',          JSON.stringify(no3Row));           }, [no3Row]);
  useEffect(() => { localStorage.setItem('earliestStart',   JSON.stringify(earliestStart));   }, [earliestStart]);
  useEffect(() => { localStorage.setItem('latestEnd',       JSON.stringify(latestEnd));        }, [latestEnd]);

  // when availableSections changes (i.e. new schedules were generated), reset allowedSections
  // to include all available letters by default — the user starts with everything allowed
  useEffect(() => {
    setAllowedSections(
      Object.fromEntries(Object.entries(availableSections).map(([k, v]) => [k, [...v]]))
    );
  }, [availableSections]);

  // if the page was opened with URL params (shared link), auto-generate schedules immediately.
  // the empty dependency array [] means this only runs once, on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!didAutoGenerate.current && URL_PARAMS.courses.length > 0 && URL_PARAMS.termCode) {
      didAutoGenerate.current = true; // prevent this from firing again if the component re-mounts
      handleGenerate();
    }
  }, []);

  // fetch the list of available terms from the API on mount
  useEffect(() => {
    fetchTerms().then(t => {
      setTerms(t);
      if (t.length > 0 && !termCode) setTermCode(t[0].term_code); // default to the first term if none is selected
    });
  }, []);

  // whenever the selected term changes, reload all courses for that term
  useEffect(() => {
    if (!termCode) return;
    // only clear selected courses when the user actively switches terms (not on the very first load)
    if (prevTermCode.current !== null && prevTermCode.current !== termCode) {
      setAllCourses([]);
      setSelected([]);
    }
    prevTermCode.current = termCode; // record the current term for next time this runs

    // fetch all subjects, then fetch all courses for each subject in parallel
    fetch('/api/subjects').then(r => r.json()).then(async (subjects: { subject_code: string }[]) => {
      const results: string[] = [];
      const namesMap: Record<string, string> = {};
      await Promise.all(subjects.map(async s => {
        try {
          const courses = await fetchCourses(s.subject_code);
          courses.forEach(c => {
            results.push(c.course_code);
            namesMap[c.course_code] = c.course_title; // store the full title so we can show/search it
          });
        } catch { /* subject may have no courses — silently skip */ }
      }));
      setAllCourses(results.sort());
      setCourseNames(namesMap);
      onCourseNamesChange(namesMap); // bubble the names up to App so CalendarGrid can use them
    });
  }, [termCode]);

  // filters the full course list down to those matching the search query.
  // matches on both course code (e.g. "MAT1320") and course title (e.g. "Calculus I").
  function handleQueryChange(val: string) {
    setQuery(val);
    if (!val.trim()) { setSuggestions([]); return; } // clear suggestions on empty input
    const q = val.toUpperCase();
    setSuggestions(allCourses.filter(c => c.toUpperCase().includes(q) || (courseNames[c] ?? '').toUpperCase().includes(q)).slice(0, 8));
  }

  function clearCourses() { setSelected([]); }

  // adds a course to the selected list (if not already there) and resets the search input
  function addCourse(code: string) {
    if (!selectedCourses.includes(code)) setSelected(prev => [...prev, code]);
    setQuery('');
    setSuggestions([]);
    inputRef.current?.focus(); // bring focus back to the input so the user can keep searching
  }

  // removes a course from the selected list using filter (returns a new array without the removed item)
  function removeCourse(code: string) {
    setSelected(prev => prev.filter(c => c !== code));
  }

  // toggles a section letter on/off for a given course.
  // if the letter is already in the list, remove it; otherwise add it.
  function toggleSection(course: string, letter: string) {
    setAllowedSections(prev => {
      const cur = prev[course] ?? [];
      return { ...prev, [course]: cur.includes(letter) ? cur.filter(l => l !== letter) : [...cur, letter] };
    });
  }

  // toggles a day in the "Days Off" list
  function toggleDay(day: string) {
    setFreeDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  // assembles the GenerateRequest and fires it off to the parent (App), which calls the API
  function handleGenerate() {
    const restrictedSections: Record<string, string[]> = {};
    for (const course of selectedCourses) {
      const available = availableSections[course] ?? [];
      const allowed   = allowedSections[course] ?? available;
      // only send a restriction if the user has deselected at least one section
      // (sending all sections is the same as no restriction, so we skip it)
      if (allowed.length > 0 && allowed.length < available.length) {
        restrictedSections[course] = allowed;
      }
    }
    const req: GenerateRequest = {
      term_code: termCode,
      courses: selectedCourses,
      filters: {
        // spread syntax with && short-circuit: only adds the key if the value is truthy
        ...(Object.keys(restrictedSections).length && { allowed_sections: restrictedSections }),
        ...(freeDays.length && { free_days: freeDays }),
        ...(noB2B && { no_back_to_back: true }),
        ...(no3Row && { no_three_in_row: true }),
        ...(earliestStart && { earliest_start: earliestStart }),
        ...(latestEnd && { latest_end: latestEnd }),
        ...(blockedTimes.length && { blocked_times: blockedTimes }),
      },
    };
    window.history.replaceState(null, '', buildUrl(req)); // update the URL without a full page reload
    onGenerate(req);
  }

  return (
  // on mobile: fixed position, slides in/out with CSS transform based on isOpen.
  // on desktop (md+): relative, always visible (translate-x-0 via md:translate-x-0).
  <div className={`dark-scroll fixed md:relative inset-y-0 left-0 z-40 md:z-auto w-72 shrink-0 h-full flex flex-col bg-gray-100 dark:bg-gray-950 border-r
    border-gray-200 dark:border-gray-800 overflow-y-auto shadow-xl transform transition-transform duration-200 ${isOpen ? 'translate-x-0' :
    '-translate-x-full'} md:translate-x-0`}>
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
        {/* × close button — only visible on mobile */}
        <button onClick={onClose} className="md:hidden ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none" aria-label="Close
        menu">×</button>
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
              placeholder="Search e.g. MAT 1320 or Calculus I"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              onKeyDown={e => {
                // pressing Enter picks the first suggestion
                if (e.key === 'Enter' && suggestions.length > 0) addCourse(suggestions[0]);
              }}
            />
            {/* dropdown only appears when there are suggestions */}
            {suggestions.length > 0 && (
              <ul className="absolute z-20 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-xl mt-1 max-h-40 overflow-y-auto">
                {suggestions.map(s => (
                  <li
                    key={s}
                    className="px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer first:rounded-t-md last:rounded-b-md"
                    onMouseDown={() => addCourse(s)} // onMouseDown fires before the input's onBlur, so the click registers
                  >
                    <div className="font-medium">{s}</div>
                    {courseNames[s] && <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{courseNames[s]}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-1.5 space-y-1">
            {selectedCourses.length === 0 && (
              <p className="text-sm text-gray-600 italic">No courses added yet.</p>
            )}
            {selectedCourses.map(c => {
              const letters = availableSections[c] ?? []; // all section letters available for this course
              const checked = allowedSections[c] ?? letters; // which ones the user has toggled on
              return (
                <div key={c}>
                  <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-sm text-gray-800 dark:text-gray-200">
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium">{c}</span>
                      {courseNames[c] && <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{courseNames[c]}</span>}
                    </div>
                    <button className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-2 shrink-0" onClick={() => removeCourse(c)}>✕</button>
                  </div>
                  {/* session date range (e.g. "Jan 6 – Apr 14") — only shown after schedules are generated */}
                  {courseDateRanges[c] && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 pl-1 mt-0.5">
                      {formatDateRange(courseDateRanges[c].start, courseDateRanges[c].end)}
                    </p>
                  )}
                  {/* section letter toggle buttons — only shown after schedules are generated */}
                  {letters.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 pl-1">
                      {letters.map(letter => {
                        const isChecked = checked.includes(letter);
                        return (
                          <button
                            key={letter}
                            onClick={() => toggleSection(c, letter)}
                            className={`px-1.5 py-0.5 rounded text-xs font-medium border transition-colors ${
                              isChecked
                                ? 'text-white border-transparent'
                                : 'bg-transparent border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                            }`}
                            style={isChecked ? { background: 'var(--accent)' } : {}}
                            title={`Section ${letter}`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
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
                onBlur={e => setEarliestStart(normalizeTime(e.target.value))} // clean up the input when the user leaves the field
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
                onBlur={e => setLatestEnd(normalizeTime(e.target.value))}
              />
            </div>
          </div>
        </Card>

        {/* Blocked times (Time Off) */}
        <Card label="Time Off" action={
          // clicking "+ Add" appends a new empty block entry to the list
          <button
            onClick={() => setBlockedTimes(prev => [...prev, { day: 'Mo', start: '', end: '' }])}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            + Add
          </button>
        }>
          {blockedTimes.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No blocked times.</p>
          )}
          <div className="space-y-1.5">
            {blockedTimes.map((block, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {/* day selector — changing it updates only this entry (index i) in the array */}
                <select
                  value={block.day}
                  onChange={e => setBlockedTimes(prev => prev.map((b, j) => j === i ? { ...b, day: e.target.value } : b))}
                  className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-1 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-red-700"
                >
                  {/* weekdays first, then weekend — reorder from DAYS array */}
                  {DAYS.filter(d => d !== 'Su' && d !== 'Sa').concat(['Su', 'Sa']).map(d => (
                    <option key={d} value={d}>{DAY_LABELS[d]}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="HH:MM"
                  value={block.start}
                  onChange={e => setBlockedTimes(prev => prev.map((b, j) => j === i ? { ...b, start: e.target.value } : b))}
                  onBlur={e => setBlockedTimes(prev => prev.map((b, j) => j === i ? { ...b, start: normalizeTime(e.target.value) } : b))}
                  className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-1 py-1 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-red-700 w-14 text-center"
                />
                <span className="text-xs text-gray-400">–</span>
                <input
                  type="text"
                  placeholder="HH:MM"
                  value={block.end}
                  onChange={e => setBlockedTimes(prev => prev.map((b, j) => j === i ? { ...b, end: e.target.value } : b))}
                  onBlur={e => setBlockedTimes(prev => prev.map((b, j) => j === i ? { ...b, end: normalizeTime(e.target.value) } : b))}
                  className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-1 py-1 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-red-700 w-14 text-center"
                />
                {/* remove this entry — filter returns a new array excluding the item at index i */}
                <button
                  onClick={() => setBlockedTimes(prev => prev.filter((_, j) => j !== i))}
                  className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-auto"
                >
                  ✕
                </button>
              </div>
            ))}
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

      {/* Generate button — pinned to the bottom of the sidebar */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
        <button
          onClick={handleGenerate}
          disabled={loading || selectedCourses.length === 0}
          className="w-full text-white font-semibold rounded-lg py-2 text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
          style={{ background: loading || selectedCourses.length === 0 ? '#374151' : 'var(--accent)' }}
        >
          {loading ? 'Generating…' : 'Generate Schedules'}
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(window.location.href); // copy the current URL (with query params) to clipboard
            setCopied(true);
            setTimeout(() => setCopied(false), 2000); // revert button text after 2 seconds
          }}
          disabled={selectedCourses.length === 0}
          className="w-full text-sm py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 hover:border-gray-400 dark:hover:border-gray-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}

// reusable card wrapper used throughout the sidebar.
// accepts an optional `action` element (e.g. a "Clear all" button) shown in the header row.
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
