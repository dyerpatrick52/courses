import { useState, useEffect } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

// applies the correct CSS class to <html> based on the current mode.
// Tailwind's dark mode looks for a "dark" class on the root element.
function applyTheme(mode: ThemeMode) {
  const html = document.documentElement; // the <html> element
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches; // the OS-level preference
  html.classList.remove('light', 'dark'); // clear both before re-applying
  if (mode === 'dark' || (mode === 'system' && prefersDark)) {
    html.classList.add('dark');
  }
  // if mode is 'light' (or 'system' with light OS preference), we leave the class off — Tailwind defaults to light
}

// custom hook that manages the theme mode, persists it to localStorage, and
// listens for OS-level dark mode changes when mode is 'system'.
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    // read the saved preference on first load; fall back to 'system' if nothing is saved
    return (localStorage.getItem('theme') as ThemeMode) ?? 'system';
  });

  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem('theme', mode); // persist the choice so it survives page refreshes

    if (mode === 'system') {
      // when in system mode, we need to react if the user changes their OS preference mid-session
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system'); // re-evaluate whenever the OS preference changes
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler); // cleanup when mode changes or component unmounts
    }
  }, [mode]);

  // cycles through the three modes in order: system → light → dark → system → ...
  function cycle() {
    setMode(m => m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system');
  }

  return { mode, cycle };
}
