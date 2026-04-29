// Three themes - dark slate with sage accents, light cream with deeper accents,
// high-contrast for accessibility. All built from the same blue/green pairing
// but with progressively stronger saturation and contrast.

export const themes = {
  dark: {
    name: 'dark',
    bg: '#161a22',
    bgElev: '#1d222c',
    bgInset: '#11141b',
    text: '#f0ede5',
    textDim: '#bdbdb1',
    textFaint: '#7a7d77',
    border: '#2a2f3a',
    borderStrong: '#3a4150',
    accent: '#7ec48a',
    accentDeep: '#5a9b68',
    accentSoft: 'rgba(126, 196, 138, 0.16)',
    secondary: '#7aa6d4',
    secondarySoft: 'rgba(122, 166, 212, 0.16)',
    income: '#7ec48a',
    expense: '#e08585',
    incomeBg: 'rgba(126, 196, 138, 0.12)',
    expenseBg: 'rgba(224, 133, 133, 0.12)',
    warning: '#e6b15a',
    warningBg: 'rgba(230, 177, 90, 0.14)',
    accountColors: ['#7ec48a', '#7aa6d4', '#d49aa6', '#b89ad4', '#e6b15a', '#5ac4b8'],
    weightAmount: 500,
    weightHeading: 500,
  },
  light: {
    name: 'light',
    bg: '#f5f1ea',
    bgElev: '#fbf8f1',
    bgInset: '#ede8df',
    text: '#1f2530',
    textDim: '#52596a',
    textFaint: '#8a8a80',
    border: '#cbc4b3',
    borderStrong: '#a8a190',
    accent: '#4d7a5a',
    accentDeep: '#345840',
    accentSoft: 'rgba(77, 122, 90, 0.14)',
    secondary: '#3a5670',
    secondarySoft: 'rgba(58, 86, 112, 0.12)',
    income: '#3e6a4c',
    expense: '#a04848',
    incomeBg: 'rgba(62, 106, 76, 0.10)',
    expenseBg: 'rgba(160, 72, 72, 0.10)',
    warning: '#8a5e1e',
    warningBg: 'rgba(138, 94, 30, 0.12)',
    accountColors: ['#4d7a5a', '#3a5670', '#9a4d5e', '#6a4d9a', '#8a5e1e', '#3a8070'],
    weightAmount: 600,
    weightHeading: 500,
  },
  hicontrast: {
    name: 'hicontrast',
    bg: '#fdfbf6',
    bgElev: '#ffffff',
    bgInset: '#f5f1e6',
    text: '#0a0d14',
    textDim: '#2d3340',
    textFaint: '#5a5e68',
    border: '#8a8478',
    borderStrong: '#4a4438',
    accent: '#1f5530',
    accentDeep: '#0d3a1a',
    accentSoft: 'rgba(31, 85, 48, 0.18)',
    secondary: '#1a3a5a',
    secondarySoft: 'rgba(26, 58, 90, 0.15)',
    income: '#1a4a28',
    expense: '#7a1f1f',
    incomeBg: 'rgba(26, 74, 40, 0.14)',
    expenseBg: 'rgba(122, 31, 31, 0.14)',
    warning: '#6a3e0a',
    warningBg: 'rgba(106, 62, 10, 0.15)',
    accountColors: ['#1f5530', '#1a3a5a', '#7a1f4a', '#4a1f7a', '#6a3e0a', '#1f5a4a'],
    weightAmount: 600,
    weightHeading: 600,
  },
};

export const SETTINGS_KEY = 'cashflow_settings_v3';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { theme: 'auto', privacy: false, textScale: 1 };
    const parsed = JSON.parse(raw);
    return {
      theme: parsed.theme || 'auto',
      privacy: !!parsed.privacy,
      textScale: parsed.textScale || 1,
    };
  } catch {
    return { theme: 'auto', privacy: false, textScale: 1 };
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
  if (setting === 'hicontrast') return 'hicontrast';
  return setting === 'light' ? 'light' : 'dark';
}

export const TEXT_SCALES = {
  small: 0.9,
  default: 1.0,
  large: 1.15,
  xlarge: 1.3,
};
