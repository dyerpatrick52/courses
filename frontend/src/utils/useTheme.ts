import { useState, useEffect } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

function applyTheme(mode: ThemeMode) {
  const html = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  html.classList.remove('light', 'dark');
  if (mode === 'dark' || (mode === 'system' && prefersDark)) {
    html.classList.add('dark');
  }
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('theme') as ThemeMode) ?? 'system';
  });

  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem('theme', mode);

    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [mode]);

  function cycle() {
    setMode(m => m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system');
  }

  return { mode, cycle };
}
