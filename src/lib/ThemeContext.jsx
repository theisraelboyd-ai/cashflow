import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { themes, loadSettings, saveSettings, resolveTheme } from './theme.js';
import { buildStyles } from './styles.js';
import { useIsDesktop } from '../hooks/useMediaQuery.js';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [settings, setSettings] = useState(() => loadSettings());
  const [systemDark, setSystemDark] = useState(true);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => setSystemDark(!mq.matches);
    handler();
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, []);

  const themeName = resolveTheme(settings.theme);
  const t = themes[themeName];
  const textScale = settings.textScale || 1;
  const styles = useMemo(() => buildStyles(t, textScale, isDesktop), [themeName, textScale, isDesktop]);

  useEffect(() => {
    document.body.style.background = t.bg;
    document.body.style.color = t.text;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.bg);
  }, [t]);

  const updateSettings = (partial) => {
    setSettings((s) => {
      const next = { ...s, ...partial };
      saveSettings(next);
      return next;
    });
  };

  const value = {
    t,
    styles,
    themeName,
    settings,
    textScale,
    isDesktop,
    updateSettings,
    privacy: !!settings.privacy,
    togglePrivacy: () => updateSettings({ privacy: !settings.privacy }),
    setTheme: (theme) => updateSettings({ theme }),
    setTextScale: (textScale) => updateSettings({ textScale }),
    viewingAs: settings.viewingAs || 'household',
    setViewingAs: (viewingAs) => updateSettings({ viewingAs }),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme outside ThemeProvider');
  return ctx;
}
