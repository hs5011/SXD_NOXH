// One CSV cell, safe to open in Excel:
// - inner double quotes are doubled (RFC 4180), so a name like `Dự án "A"` keeps its column
// - text starting with = + - @ (or a tab / carriage return) is prefixed with ' so Excel shows it as
//   text instead of running it as a formula (CSV injection). Plain numbers and a lone "-" are left as is.
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+([.,]\d+)?$/;

export const csvCell = (value: unknown): string => {
  let text = value === null || value === undefined ? '' : String(value);
  if (text.length > 1 && FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
};

export const csvRow = (cells: unknown[]): string => cells.map(csvCell).join(',');
