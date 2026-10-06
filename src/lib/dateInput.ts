/**
 * Checks text typed into a date field. react-datepicker silently restores the previous value when
 * the typed text is not a date, so forms call this on blur to tell the user what went wrong.
 *
 * Accepts '' (empty field), dd/mm/yyyy that exists on the calendar (31/02/2026 is rejected) and,
 * when `allowYearOnly`, a bare yyyy.
 */
export function isValidDateInput(raw: string, allowYearOnly = false): boolean {
  const text = String(raw ?? '').trim();
  if (!text) return true;
  if (allowYearOnly && /^\d{4}$/.test(text)) return true;
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

export const INVALID_DATE_MESSAGE = 'Ngày không hợp lệ. Vui lòng nhập theo dạng dd/mm/yyyy.';
