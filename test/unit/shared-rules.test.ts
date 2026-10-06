/**
 * Unit tests: quy tắc dùng chung giữa server và client (sửa ngày 29/09/2026)
 *   C4/C6 – phaseLogic: pha hiện tại, ô kế hoạch trống KHÔNG phải "đã xong"
 *   C7    – wardMatch: lọc dự án theo phường khớp chính xác
 *   C10   – dateCompare: so sánh ngày khác định dạng (dd/mm/yyyy vs yyyy-mm-dd)
 */
import { describe, it, expect } from 'vitest';
import { STANDARD_PHASES, computeActivePhase, isPhaseSideDone, isPlanDatePassed, isProjectOverdue, getPhaseSideStatus } from '../../src/lib/phaseLogic';
import { isProjectInWard, normalizeWardName } from '../../src/lib/wardMatch';
import { compareDateStrings, isDateAfter, isDateBefore, laterDate, parseDateStrict } from '../../src/lib/dateCompare';

// ═════════════════════════════════════════════════════════════════════════════
describe('phaseLogic – ô kế hoạch và pha hiện tại', () => {
  it('ô kế hoạch trống không được tính là đã xong', () => {
    expect(isPhaseSideDone('', undefined)).toBe(false);
    expect(isPhaseSideDone(undefined, '')).toBe(false);
  });

  it('"X" hoặc có ngày thực tế thì là đã xong', () => {
    expect(isPhaseSideDone('X', undefined)).toBe(true);
    expect(isPhaseSideDone('01/02/2026', '15/02/2026')).toBe(true);
  });

  it('dự án mới (mọi ô trống) đang ở pha đầu tiên, không phải "hoàn thành"', () => {
    const info = computeActivePhase({ id: 'new' }, {});
    expect(info.activePhase.id).toBe('chutruong');
    expect(info.completedPhasesCount).toBe(0);
    expect(info.isCompleted).toBe(false);
  });

  it('pha hiện tại là pha đầu tiên chưa đủ cả CĐT và NN', () => {
    const actual = {
      chutruong: { cdtDate: '01/01/2026', nnDate: '10/01/2026' },
      qh1500: { cdtDate: '01/03/2026', nnDate: '' },
    };
    const info = computeActivePhase({ id: 'p' }, actual);
    expect(info.activePhase.id).toBe('qh1500');
    expect(info.activeAgency).toBe('Sở Quy hoạch Kiến trúc');
    expect(info.completedPhasesCount).toBe(1);
  });

  it('pha có ô kế hoạch "X" ở cả hai phía được bỏ qua', () => {
    const project = { id: 'p', chutruong_cdt_date: 'X', chutruong_nn_date: 'X' };
    expect(computeActivePhase(project, {}).activePhase.id).toBe('qh1500');
  });

  it('đủ 7 pha thì isCompleted = true và giữ ở pha cuối', () => {
    const actual = Object.fromEntries(STANDARD_PHASES.map(p => [p.id, { cdtDate: '01/01/2026', nnDate: '02/01/2026' }]));
    const info = computeActivePhase({ id: 'p' }, actual);
    expect(info.isCompleted).toBe(true);
    expect(info.activePhase.id).toBe('gpxd');
  });

  it('bước Giao đất thuộc UBND cấp xã, phường (khớp giữa server và client)', () => {
    expect(STANDARD_PHASES.find(p => p.id === 'giaodat')?.agency).toBe('UBND cấp xã, phường');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('wardMatch – lọc dự án theo phường', () => {
  it('khớp đúng phường của tài khoản', () => {
    expect(isProjectInWard('Phường Tân Phú, TP.HCM', 'Phường Tân Phú')).toBe(true);
    expect(isProjectInWard('12 Đường A, Phường Tân Phú, TP.HCM', 'Phường Tân Phú')).toBe(true);
  });

  it('"Phường 1" không còn khớp "Phường 12"', () => {
    expect(isProjectInWard('Phường 12, TP.HCM', 'Phường 1')).toBe(false);
  });

  it('"Xã Bình Hưng" không khớp "Phường Bình Hưng Hòa"', () => {
    expect(isProjectInWard('Phường Bình Hưng Hòa, TP.HCM', 'Xã Bình Hưng')).toBe(false);
  });

  it('"Xã X" không khớp "Phường X" (khác đơn vị hành chính)', () => {
    expect(isProjectInWard('Phường An Phú, TP.HCM', 'Xã An Phú')).toBe(false);
  });

  it('tài khoản chưa có phường thì không thấy dự án nào', () => {
    expect(isProjectInWard('Phường Tân Phú, TP.HCM', '')).toBe(false);
    expect(isProjectInWard('Phường Tân Phú, TP.HCM', undefined)).toBe(false);
  });

  it('không phân biệt hoa thường, khoảng trắng; hiểu "P." và tên thiếu chữ "Phường"', () => {
    expect(isProjectInWard('phường  tân phú , tp.hcm', 'Phường Tân Phú')).toBe(true);
    expect(isProjectInWard('P. Tân Phú, TP.HCM', 'Phường Tân Phú')).toBe(true);
    expect(isProjectInWard('Tân Phú, TP.HCM', 'Phường Tân Phú')).toBe(true);
  });

  it('chuẩn hóa tên bị lặp đơn vị "Phường Phường An Nhơn"', () => {
    expect(normalizeWardName('Phường Phường An Nhơn')).toBe('phường an nhơn');
    expect(isProjectInWard('Phường An Nhơn, TP.HCM', 'Phường Phường An Nhơn')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('dateCompare – so sánh ngày khác định dạng', () => {
  it('so sánh đúng giữa ISO và dd/mm/yyyy (trường hợp so chuỗi bị sai)', () => {
    // So chuỗi: "2026-11-01" > "05/12/2026" → true (sai). So ngày: 01/11 trước 05/12.
    expect(isDateAfter('2026-11-01', '05/12/2026')).toBe(false);
    expect(isDateBefore('2026-11-01', '05/12/2026')).toBe(true);
  });

  it('cùng một ngày ở hai định dạng thì bằng nhau', () => {
    expect(compareDateStrings('2026-12-05', '05/12/2026')).toBe(0);
  });

  it('giá trị trống hoặc không hợp lệ thì không so sánh (không chặn nhầm)', () => {
    expect(compareDateStrings('', '05/12/2026')).toBeNull();
    expect(isDateAfter('abc', '05/12/2026')).toBe(false);
    expect(parseDateStrict('31/04/2026')).toBeNull();
  });

  it('laterDate trả về ngày muộn hơn và giữ nguyên định dạng gốc', () => {
    expect(laterDate('05/12/2026', '2026-11-01')).toBe('05/12/2026');
    expect(laterDate('2026-11-01', '05/12/2026')).toBe('05/12/2026');
    expect(laterDate('', '2026-11-01')).toBe('2026-11-01');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('phaseLogic – quá hạn (C5): một định nghĩa cho mọi màn hình', () => {
  const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0);

  it('đúng ngày hạn thì chưa quá hạn; sang ngày hôm sau mới quá hạn', () => {
    expect(isPlanDatePassed('23/07/2026', at(2026, 7, 23, 23))).toBe(false);
    expect(isPlanDatePassed('23/07/2026', at(2026, 7, 24, 0))).toBe(true);
    expect(isPlanDatePassed('2026-07-23', at(2026, 7, 23, 10))).toBe(false);
  });

  it('ô kế hoạch trống/"X"/không hợp lệ thì không bao giờ quá hạn', () => {
    expect(isPlanDatePassed('', at(2030, 1, 1))).toBe(false);
    expect(isPlanDatePassed('X', at(2030, 1, 1))).toBe(false);
    expect(isPlanDatePassed('31/04/2026', at(2030, 1, 1))).toBe(false);
  });

  it('dự án quá hạn khi một phía chưa xong của pha hiện tại đã qua ngày kế hoạch', () => {
    const project = { id: 'p', chutruong_cdt_date: '01/03/2026', chutruong_nn_date: '01/12/2026' };
    // CĐT chưa nộp, hạn 01/03 đã qua → quá hạn
    expect(isProjectOverdue(project, {}, at(2026, 9, 29))).toBe(true);
    // CĐT đã nộp; NN hạn 01/12 chưa tới → không quá hạn
    expect(isProjectOverdue(project, { chutruong: { cdtDate: '15/02/2026' } }, at(2026, 9, 29))).toBe(false);
  });

  it('phía NN đã xong thì không bị tính trễ theo kế hoạch NN (lỗi cũ của DashboardApp/Gantt)', () => {
    const project = { id: 'p', chutruong_cdt_date: '01/12/2026', chutruong_nn_date: '01/09/2026' };
    const actual = { chutruong: { nnDate: '20/08/2026' } };
    expect(isProjectOverdue(project, actual, at(2026, 9, 29))).toBe(false);
  });

  it('pha chưa tới không làm dự án quá hạn', () => {
    const project = { id: 'p', chutruong_cdt_date: '01/12/2026', chutruong_nn_date: '15/12/2026', gpxaydung_cdt_date: '01/01/2026' };
    expect(isProjectOverdue(project, {}, at(2026, 9, 29))).toBe(false);
  });

  it('getPhaseSideStatus: done / in_progress / delayed / not_started', () => {
    const now = at(2026, 9, 29);
    expect(getPhaseSideStatus('X', '', 0, 0, now)).toBe('done');
    expect(getPhaseSideStatus('01/12/2026', '', 0, 0, now)).toBe('in_progress');
    expect(getPhaseSideStatus('01/03/2026', '', 0, 0, now)).toBe('delayed');
    expect(getPhaseSideStatus('01/03/2026', '', 3, 0, now)).toBe('not_started');
  });
});
