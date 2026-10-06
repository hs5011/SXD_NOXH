// Dates are stored both as dd/mm/yyyy (milestones synced to root) and yyyy-mm-dd (date pickers),
// so they must be compared as dates, never as strings ("2026-11-01" > "05/12/2026" is true as text).

// Self-contained (same rules as projectUtils.parseDate) so tests that mock projectUtils do not affect it.
// Accepts dd/mm/yyyy, dd/mm/yy and yyyy-mm-dd; rejects overflow dates such as 31/04.
export const parseDateStrict = (value: string | undefined | null): Date | null => {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (match) {
    d = Number(match[1]); m = Number(match[2]); y = Number(match[3]);
    if (y < 100) y += 2000;
  } else if ((match = v.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
  } else {
    return null;
  }
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) return null;
  return date;
};

// Negative / 0 / positive like a comparator, or null when either value is empty or unparseable.
export const compareDateStrings = (a: string | undefined | null, b: string | undefined | null): number | null => {
  const da = parseDateStrict(a);
  const db = parseDateStrict(b);
  if (!da || !db) return null;
  return da.getTime() - db.getTime();
};

export const isDateBefore = (a: string | undefined | null, b: string | undefined | null): boolean => {
  const c = compareDateStrings(a, b);
  return c !== null && c < 0;
};

export const isDateAfter = (a: string | undefined | null, b: string | undefined | null): boolean => {
  const c = compareDateStrings(a, b);
  return c !== null && c > 0;
};

// The later of two date strings (keeps the original string format); falls back to whichever is set.
export const laterDate = (a: string | undefined | null, b: string | undefined | null): string => {
  if (!a) return b || '';
  if (!b) return a;
  return isDateAfter(b, a) ? b : a;
};
