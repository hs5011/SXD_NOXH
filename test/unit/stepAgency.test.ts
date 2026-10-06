/**
 * Regression tests: rà soát phân quyền theo role ngày 05/10/2026
 *   - Cơ quan "UBND xã phường" trong cấu hình quy trình = "UBND cấp xã, phường" (phường được cập nhật bước cs7/cs57)
 *   - Tên bước trùng nhau giữa các cơ quan: bước hiện tại xác định theo id trong quy trình của dự án
 *   - Kết thúc một bước mà không chọn bước tiếp theo không đưa dự án về "Khởi tạo hồ sơ"
 */
import { describe, it, expect } from 'vitest';
import { normalizeAgencyName, resolveProjectStep, resolveProjectStepAgency, findActiveSteps, flattenProcessSteps } from '../../src/lib/stepAgency';
import { calculateProjectStatus, getStepAgency } from '../../src/lib/projectUtils';

const SAME_NAME = 'Chấp thuận (Trường hợp đất <2ha)';
const processes: any[] = [
  {
    id: 'p5',
    name: 'Quy trình <2ha',
    parentSteps: [
      { id: 'ps1', name: 'Chủ trương', childSteps: [{ id: 'a1', name: 'Thẩm định chủ trương', agency: 'Sở Xây dựng' }] },
      {
        id: 'ps2',
        name: 'Quy hoạch',
        childSteps: [
          { id: 'b1', name: SAME_NAME, agency: 'UBND TP' },
          { id: 'b2', name: SAME_NAME, agency: 'UBND cấp xã, phường' }
        ]
      },
      { id: 'ps3', name: 'Giao đất', childSteps: [{ id: 'c1', name: 'Phê duyệt giao đất', agency: 'UBND xã phường' }] }
    ]
  },
  {
    id: 'p1',
    name: 'Quy trình khác',
    parentSteps: [{ id: 'x', name: 'X', childSteps: [{ id: 'b1', name: 'Thẩm định chủ trương', agency: 'Sở Tài chính' }] }]
  }
];

describe('normalizeAgencyName', () => {
  it('các cách viết của UBND phường/xã quy về "UBND cấp xã, phường"', () => {
    expect(normalizeAgencyName('UBND xã phường')).toBe('UBND cấp xã, phường');
    expect(normalizeAgencyName('  UBND  xã,  phường ')).toBe('UBND cấp xã, phường');
    expect(normalizeAgencyName('UBND cấp xã, phường')).toBe('UBND cấp xã, phường');
  });

  it('tên khác giữ nguyên; rỗng/null → ""', () => {
    expect(normalizeAgencyName('UBND TP')).toBe('UBND TP');
    expect(normalizeAgencyName(null)).toBe('');
  });
});

describe('resolveProjectStep – tên bước trùng nhau', () => {
  it('có currentStepId → lấy đúng bước theo id trong quy trình của dự án', () => {
    expect(resolveProjectStepAgency({ processId: 'p5', currentStep: SAME_NAME, currentStepId: 'b1' }, processes)).toBe('UBND TP');
    expect(resolveProjectStepAgency({ processId: 'p5', currentStep: SAME_NAME, currentStepId: 'b2' }, processes)).toBe('UBND cấp xã, phường');
  });

  it('id cũ không khớp tên bước hiện tại thì bỏ qua id', () => {
    const p = { processId: 'p5', currentStep: 'Thẩm định chủ trương', currentStepId: 'b1' };
    expect(resolveProjectStepAgency(p, processes)).toBe('Sở Xây dựng');
  });

  it('chưa có id → suy ra từ kế hoạch (bước đang có HXL)', () => {
    const p = {
      processId: 'p5',
      currentStep: SAME_NAME,
      implementationPlan: { a1: { agencyActualDate: '2026-01-01' } },
      milestones: { b2: { agency: '2099-01-01' } }
    };
    expect(resolveProjectStep(p, processes)?.id).toBe('b2');
  });

  it('không phân biệt được → không gán cơ quan nào (không đoán theo tên)', () => {
    expect(resolveProjectStepAgency({ processId: 'p5', currentStep: SAME_NAME }, processes)).toBe('');
  });

  it('tên bước giống bước của quy trình khác không bị lẫn', () => {
    expect(resolveProjectStepAgency({ processId: 'p5', currentStep: 'Thẩm định chủ trương' }, processes)).toBe('Sở Xây dựng');
    expect(resolveProjectStepAgency({ processId: 'p1', currentStep: 'Thẩm định chủ trương' }, processes)).toBe('Sở Tài chính');
  });

  it('cơ quan "UBND xã phường" của bước được chuẩn hóa', () => {
    expect(resolveProjectStepAgency({ processId: 'p5', currentStep: 'Phê duyệt giao đất' }, processes)).toBe('UBND cấp xã, phường');
    expect(getStepAgency({ processId: 'p5', currentStep: 'Phê duyệt giao đất' }, processes)).toBe('UBND cấp xã, phường');
  });
});

describe('findActiveSteps / calculateProjectStatus – kết thúc bước không chọn bước tiếp theo', () => {
  const steps = flattenProcessSteps(processes[0]);

  it('chưa bước nào xong → bước đầu tiên', () => {
    expect(findActiveSteps(steps, {}, {}).map(s => s.id)).toEqual(['a1']);
  });

  it('bước có trạng thái xử lý (chưa có ngày) → là bước hiện tại, không quay về bước đầu', () => {
    expect(findActiveSteps(steps, {}, { b1: { agencyStatus: 'Đang xử lý' } }).map(s => s.id)).toEqual(['b1']);
    expect(findActiveSteps(steps, { b2: { agency: '2099-01-01' } }, { b1: { agencyStatus: 'Đang xử lý' } })[0].id).toBe('b1');
  });

  it('bước đầu xong, chưa lên kế hoạch bước nào → bước chưa xong kế tiếp', () => {
    const r = calculateProjectStatus({}, 'p5', processes, { a1: { agencyActualDate: '2026-10-05' } });
    expect(r.currentStepId).toBe('b1');
    expect(r.currentAgency).toBe('UBND TP');
    expect(r.currentStep).not.toBe('Khởi tạo hồ sơ');
  });

  it('bước tiếp theo đã chọn (có HXL) được ưu tiên', () => {
    const r = calculateProjectStatus({ b2: { agency: '2099-01-01' } }, 'p5', processes, { a1: { agencyActualDate: '2026-10-05' } });
    expect(r.currentStepId).toBe('b2');
    expect(r.currentAgency).toBe('UBND cấp xã, phường');
  });

  it('tất cả bước xong → "Hoàn thành", không còn bước hiện tại', () => {
    const plan = { a1: { agencyActualDate: 'x' }, b1: { agencyActualDate: 'x' }, b2: { agencyActualDate: 'x' }, c1: { agencyActualDate: 'x' } };
    const r = calculateProjectStatus({}, 'p5', processes, plan);
    expect(r.currentStep).toBe('Hoàn thành');
    expect(r.currentStepId).toBe('');
    expect(r.progress).toBe(100);
  });
});

// ─── Ngày hiển thị một chuẩn dd/MM/yyyy (05/10/2026) ─────────────────────────
import { toDisplayDate, toDisplayDateTime, formatDate, formatShortDate } from '../../src/lib/projectUtils';

describe('toDisplayDate – mọi kiểu ngày đang lưu đều hiện dd/MM/yyyy', () => {
  it('d/M/yy, d/M/yyyy, dd/MM/yyyy, yyyy-MM-dd', () => {
    expect(toDisplayDate('30/6/26')).toBe('30/06/2026');
    expect(toDisplayDate('4/5/2026')).toBe('04/05/2026');
    expect(toDisplayDate('14/07/26')).toBe('14/07/2026');
    expect(toDisplayDate('25/05/2026')).toBe('25/05/2026');
    expect(toDisplayDate('2026-06-30')).toBe('30/06/2026');
  });

  it('không phải ngày thì giữ nguyên; rỗng → ""', () => {
    expect(toDisplayDate('X')).toBe('X');
    expect(toDisplayDate('đang chờ')).toBe('đang chờ');
    expect(toDisplayDate('')).toBe('');
    expect(toDisplayDate(null)).toBe('');
  });

  it('formatDate / formatShortDate cũng ra năm 4 chữ số', () => {
    expect(formatDate('11/5/26')).toBe('11/05/2026');
    expect(formatShortDate('30/6/26')).toBe('30/06/2026');
    expect(formatShortDate('X')).toBe('-');
  });

  it('thời điểm ISO (UTC) hiện theo giờ máy: HH:mm - dd/MM/yyyy', () => {
    const iso = new Date(2026, 9, 5, 9, 49).toISOString();
    expect(toDisplayDateTime(iso)).toBe('09:49 - 05/10/2026');
  });
});

describe('normalizeDatesInText – ngày trong nội dung lịch sử cũ', () => {
  it('đổi d/M/yy và d/M/yyyy thành dd/MM/yyyy, giữ nguyên phần chữ', async () => {
    const { normalizeDatesInText } = await import('../../src/lib/projectUtils');
    expect(normalizeDatesInText('Thay đổi "QH 1/500" từ "25/5/26" thành "14/7/2026".'))
      .toBe('Thay đổi "QH 1/500" từ "25/05/2026" thành "14/07/2026".');
    expect(normalizeDatesInText('Ngày 31/2/26 không có thật')).toBe('Ngày 31/2/26 không có thật');
    expect(normalizeDatesInText('')).toBe('');
  });
});
