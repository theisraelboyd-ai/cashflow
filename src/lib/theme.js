// Two themes - dark slate with sage accents, light cream with deeper accents
// The blue-green pairing is intentional: slate-blue is the structural/header colour,
// sage is the primary action colour. Together they balance masculine and feminine cues.

export const themes = {
  dark: {
    name: 'dark',
    // Backgrounds - deep slate-blue base, slightly lifted card layer
    bg: '#161a22',
    bgElev: '#1d222c',
    bgInset: '#11141b',
    // Text
    text: '#e8e6df',
    textDim: '#a8a89e',
    textFaint: '#6b6e6a',
    // Borders and dividers
    border: '#2a2f3a',
    borderStrong: '#3a4150',
    // Accents
    accent: '#9eb89a',         // Sage green - primary CTA
    accentDeep: '#6e8a76',     // Deeper sage for hover/dark
    accentSoft: 'rgba(158, 184, 154, 0.12)',
    secondary: '#7a95b8',      // Slate blue - headings/structural
    secondarySoft: 'rgba(122, 149, 184, 0.12)',
    // Semantic
    income: '#9eb89a',         // Sage green
    expense: '#c89090',        // Dusty rose
    incomeBg: 'rgba(158, 184, 154, 0.08)',
    expenseBg: 'rgba(200, 144, 144, 0.08)',
    warning: '#d4a76a',
    warningBg: 'rgba(212, 167, 106, 0.1)',
    // Account colours - slightly muted versions
    accountColors: ['#9eb89a', '#7a95b8', '#b89a9e', '#a89eb8', '#c4a875', '#7ab8a3'],
  },
  light: {
    name: 'light',
    // Warm cream base, slightly cooler card layer
    bg: '#f5f1ea',
    bgElev: '#fbf8f1',
    bgInset: '#ede8df',
    // Text - deep slate-blue, not pure black
    text: '#2a3142',
    textDim: '#6a7080',
    textFaint: '#9a9a90',
    // Borders
    border: '#d8d2c5',
    borderStrong: '#b8b2a5',
    // Accents
    accent: '#6e8a76',         // Deeper sage on light
    accentDeep: '#4d6855',
    accentSoft: 'rgba(110, 138, 118, 0.12)',
    secondary: '#4d6580',      // Deeper slate blue
    secondarySoft: 'rgba(77, 101, 128, 0.1)',
    // Semantic
    income: '#5d7a64',
    expense: '#a06868',
    incomeBg: 'rgba(93, 122, 100, 0.08)',
    expenseBg: 'rgba(160, 104, 104, 0.08)',
    warning: '#a87a3e',
    warningBg: 'rgba(168, 122, 62, 0.1)',
    accountColors: ['#6e8a76', '#4d6580', '#8a5d6e', '#7a5d8a', '#a07840', '#4d8a7a'],
  },
};

export const SETTINGS_KEY = 'cashflow_settings_v3';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { theme: 'auto', privacy: false };
    return JSON.parse(raw);
  } catch {
    return { theme: 'auto', privacy: false };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

export function resolveTheme(setting) {
  if (setting === 'auto') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  }
  return setting === 'light' ? 'light' : 'dark';
}
