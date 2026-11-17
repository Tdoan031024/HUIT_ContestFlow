'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);

  function toggleTheme() {
    const nextDark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = nextDark ? 'dark' : 'light';
    window.localStorage.setItem('contestflow-theme', nextDark ? 'dark' : 'light');
    setDark(nextDark);
  }

  return (
    <button
      className={`theme-toggle ${className}`.trim()}
      type="button"
      aria-label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      aria-pressed={dark}
      onClick={toggleTheme}
      title={dark ? 'Giao diện tối' : 'Giao diện sáng'}
    >
      <span aria-hidden="true">{dark ? '☀' : '☾'}</span>
      <span className="theme-toggle-label">{dark ? 'Giao diện tối' : 'Giao diện sáng'}</span>
    </button>
  );
}
