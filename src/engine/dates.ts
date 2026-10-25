export const addDays = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10);
};

export const todayLocal = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

export const daysBetween = (a: string, b: string): number => {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
};

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** '2026-10-03' -> '3 Oct'. Pass withYear for '3 Oct 2026'. */
export const fmtDate = (iso: string, withYear = false) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ' ' + y : ''}`;
};

export const fmtWeekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

export const fmtDateList = (dates: string[], max = 6) => {
  const shown = dates.slice(0, max).map(d => fmtDate(d));
  return dates.length > max ? `${shown.join(', ')} and ${dates.length - max} more` : shown.join(', ');
};

export const dateRange = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
};
