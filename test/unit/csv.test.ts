import { describe, it, expect } from 'vitest';
import { csvCell, csvRow } from '../../src/lib/csv';

describe('csvCell – xuất CSV an toàn (lỗi #7, 05/10/2026)', () => {
  it('nhân đôi dấu " bên trong để không lệch cột', () => {
    expect(csvCell('Dự án "Nhà ở xã hội A"')).toBe('"Dự án ""Nhà ở xã hội A"""');
  });
  it.each(['=HYPERLINK("http://x","y")', '+1+1', '-2+3', '@SUM(A1)', '=cmd|calc!A1'])('chặn công thức: %s', (v) => {
    expect(csvCell(v).startsWith(`"'`)).toBe(true);
  });
  it('giữ nguyên số, dấu "-" đơn và chữ thường', () => {
    expect(csvCell('-')).toBe('"-"');
    expect(csvCell('-5')).toBe('"-5"');
    expect(csvCell('1,5')).toBe('"1,5"');
    expect(csvCell('Phường An Lạc')).toBe('"Phường An Lạc"');
  });
  it('null / undefined thành ô rỗng; csvRow nối bằng dấu phẩy', () => {
    expect(csvCell(undefined)).toBe('""');
    expect(csvRow(['a', null, 'b"c'])).toBe('"a","","b""c"');
  });
});
