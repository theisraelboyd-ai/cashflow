export const fmt = (n) => {
  const num = Number(n) || 0;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  }).format(num);
};

export const fmtShort = (n) => {
  const num = Number(n) || 0;
  if (Math.abs(num) >= 1000) return '£' + (num / 1000).toFixed(1) + 'k';
  return '£' + num.toFixed(0);
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export const startOfMonth = (d) => {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const endOfMonth = (d) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1, 0);
  x.setHours(23, 59, 59, 999);
  return x;
};

export const addMonths = (d, n) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const monthLabel = (d) =>
  new Date(d).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

export const monthLongLabel = (d) =>
  new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export const dayLabel = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export const dateKey = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
};

export const sameDay = (a, b) => dateKey(a) === dateKey(b);

export const calendarDaysBetween = (start, end) => {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  if (e < s) return 0;
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

// Privacy-aware money formatter
export const fmtPrivate = (n, privacy) => {
  if (privacy) return '£' + '•'.repeat(4);
  return fmt(n);
};
