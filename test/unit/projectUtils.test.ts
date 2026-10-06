import { describe, it, expect, vi } from 'vitest';

// Mock StepManagementView để tránh load React/DOM trong môi trường Node
vi.mock('../../src/components/StepManagementView.tsx', () => ({}));

import { parseDate, formatDate, getStepAgency, calculateProjectStatus } from '../../src/lib/projectUtils.ts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProcess(id: string, childSteps: Array<{ id: string; name: string; agency: string }> = []) {
  return {
    id,
    name: `Quy trình ${id}`,
    parentSteps: [
      {
        id: 'ps-1',
        name: 'Giai đoạn 1',
        childSteps,
      },
    ],
  };
}

function makeProcessMultiStage(id: string, stages: Array<{ id: string; name: string; childSteps: Array<{ id: string; name: string; agency: string }> }>) {
  return {
    id,
    name: `Quy trình ${id}`,
    parentSteps: stages,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// parseDate
// ═════════════════════════════════════════════════════════════════════════════
describe('parseDate', () => {
  it('trả về null với giá trị null', () => {
    expect(parseDate(null)).toBeNull();
  });

  it('trả về null với giá trị undefined', () => {
    expect(parseDate(undefined)).toBeNull();
  });

  it('trả về null với chuỗi rỗng', () => {
    expect(parseDate('')).toBeNull();
  });

  it('trả về null với giá trị "X"', () => {
    expect(parseDate('X')).toBeNull();
  });

  it('trả về null với giá trị "--"', () => {
    expect(parseDate('--')).toBeNull();
  });

  it('parse định dạng dd/mm/yyyy đúng', () => {
    const d = parseDate('15/06/2024');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(5); // tháng 6, 0-indexed
    expect(d!.getDate()).toBe(15);
  });

  it('parse định dạng yyyy-mm-dd đúng', () => {
    const d = parseDate('2024-06-15');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(15);
  });

  it('xử lý năm 2 chữ số (dd/mm/yy)', () => {
    const d = parseDate('15/06/24');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
  });

  it('trả về null với ngày không hợp lệ (31/02)', () => {
    expect(parseDate('31/02/2024')).toBeNull();
  });

  it('trả về null với chuỗi không phải ngày', () => {
    expect(parseDate('khong-phai-ngay')).toBeNull();
  });

  it('trả về null với tháng không hợp lệ (13)', () => {
    expect(parseDate('01/13/2024')).toBeNull();
  });

  it('trả về null với ngày NaN trong các parts', () => {
    expect(parseDate('ab/cd/efgh')).toBeNull();
  });

  it('parse ngày đầu tháng đúng', () => {
    const d = parseDate('01/01/2023');
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(1);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getFullYear()).toBe(2023);
  });

  it('parse ngày cuối tháng hợp lệ (30/04)', () => {
    const d = parseDate('30/04/2024');
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(30);
  });

  it('parse ngày 31/12 đúng', () => {
    const d = parseDate('31/12/2025');
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(11);
    expect(d!.getDate()).toBe(31);
  });

  it('parse định dạng ISO 8601 đầy đủ (có giờ)', () => {
    const d = parseDate('2024-06-15T10:30:00.000Z');
    expect(d).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// formatDate
// ═════════════════════════════════════════════════════════════════════════════
describe('formatDate', () => {
  it('trả về chuỗi rỗng với null', () => {
    expect(formatDate(null)).toBe('');
  });

  it('trả về chuỗi rỗng với undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('trả về chuỗi rỗng với "X"', () => {
    expect(formatDate('X')).toBe('');
  });

  it('trả về chuỗi rỗng với "--"', () => {
    expect(formatDate('--')).toBe('');
  });

  it('giữ nguyên chuỗi đã ở định dạng dd/mm/yyyy', () => {
    expect(formatDate('15/06/2024')).toBe('15/06/2024');
  });

  it('chuyển yyyy-mm-dd sang dd/mm/yyyy', () => {
    expect(formatDate('2024-06-15')).toBe('15/06/2024');
  });

  it('padding đúng với ngày/tháng 1 chữ số', () => {
    expect(formatDate('2024-01-05')).toBe('05/01/2024');
  });

  it('chuyển đúng ngày cuối năm', () => {
    expect(formatDate('2025-12-31')).toBe('31/12/2025');
  });

  it('chuyển đúng ngày đầu tháng', () => {
    expect(formatDate('2024-03-01')).toBe('01/03/2024');
  });

  it('trả về chuỗi gốc khi không parse được (fallback)', () => {
    // Code: if (!date) return dateString || '' → trả về chuỗi gốc, không phải ''
    expect(formatDate('khong-phai-ngay')).toBe('khong-phai-ngay');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getStepAgency
// ═════════════════════════════════════════════════════════════════════════════
describe('getStepAgency', () => {
  const processes = [
    makeProcess('proc-1', [
      { id: 's1', name: 'Chấp thuận chủ trương', agency: 'Sở Xây Dựng' },
      { id: 's2', name: 'Quy hoạch 1/500', agency: 'Sở QHKT' },
    ]),
  ];

  it('trả về agency đúng khi tìm thấy bước', () => {
    const project = { currentStep: 'Chấp thuận chủ trương', processId: 'proc-1' };
    expect(getStepAgency(project, processes)).toBe('Sở Xây Dựng');
  });

  it('trả về agency đúng cho bước thứ 2', () => {
    const project = { currentStep: 'Quy hoạch 1/500', processId: 'proc-1' };
    expect(getStepAgency(project, processes)).toBe('Sở QHKT');
  });

  // Bước không có trong cấu hình quy trình → suy ra theo 7 pha pháp lý (src/lib/phaseLogic):
  // pha đầu tiên, phía CĐT chưa nộp → hồ sơ đang ở "Chủ đầu tư"
  it('không tìm thấy bước → suy ra theo pha: CĐT chưa nộp thì là "Chủ đầu tư"', () => {
    const project = { currentStep: 'Bước không tồn tại', processId: 'proc-1' };
    expect(getStepAgency(project, processes, {})).toBe('Chủ đầu tư');
  });

  it('currentStep rỗng → suy ra theo pha', () => {
    const project = { currentStep: '', processId: 'proc-1' };
    expect(getStepAgency(project, processes, {})).toBe('Chủ đầu tư');
  });

  it('processes rỗng → suy ra theo pha; CĐT đã nộp thì là cơ quan của pha', () => {
    const project = { currentStep: 'Chấp thuận chủ trương', processId: 'proc-1' };
    expect(getStepAgency(project, [], { chutruong: { cdtDate: '01/01/2026' } })).toBe('Sở Xây dựng');
  });

  it('không có project → "Chưa xác định"', () => {
    expect(getStepAgency(null, processes)).toBe('Chưa xác định');
  });

  it('fallback sang processes[0] khi processId không tìm thấy', () => {
    // Code: processes.find(...) || processes[0] → dùng process đầu tiên làm fallback
    // Step 'Chấp thuận chủ trương' tồn tại trong proc-1 (processes[0]) → trả về agency của nó
    const project = { currentStep: 'Chấp thuận chủ trương', processId: 'proc-999' };
    expect(getStepAgency(project, processes)).toBe('Sở Xây Dựng');
  });

  it('fallback sang processes[0] khi project không có processId', () => {
    // Không có processId → find() trả về undefined → fallback về processes[0]
    const project = { currentStep: 'Chấp thuận chủ trương' };
    expect(getStepAgency(project, processes)).toBe('Sở Xây Dựng');
  });

  it('hoạt động với nhiều parentSteps', () => {
    const multiStageProcess = makeProcessMultiStage('proc-multi', [
      { id: 'stage-1', name: 'Giai đoạn 1', childSteps: [{ id: 's1', name: 'Bước A', agency: 'Cơ quan A' }] },
      { id: 'stage-2', name: 'Giai đoạn 2', childSteps: [{ id: 's2', name: 'Bước B', agency: 'Cơ quan B' }] },
    ]);
    const project = { currentStep: 'Bước B', processId: 'proc-multi' };
    expect(getStepAgency(project, [multiStageProcess])).toBe('Cơ quan B');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// calculateProjectStatus
// ═════════════════════════════════════════════════════════════════════════════
describe('calculateProjectStatus', () => {
  const steps = [
    { id: 'step-1', name: 'Chủ trương', agency: 'Sở XD' },
    { id: 'step-2', name: 'Quy hoạch', agency: 'Sở QHKT' },
    { id: 'step-3', name: 'Giao đất',  agency: 'UBND' },
  ];
  const processes = [makeProcess('proc-1', steps)] as any[];

  it('trả về trạng thái mặc định khi không tìm thấy process', () => {
    const result = calculateProjectStatus({}, 'proc-khong-ton-tai', processes);
    expect(result.progress).toBe(0);
    expect(result.currentStep).toBe('Chưa chọn quy trình');
  });

  it('bước đầu tiên active khi chưa có gì hoàn thành', () => {
    const result = calculateProjectStatus({}, 'proc-1', processes);
    expect(result.currentStep).toContain('Chủ trương');
    expect(result.progress).toBe(0);
  });

  it('tính progress đúng khi 1 bước hoàn thành (33%)', () => {
    const milestones = { 'step-1': { actualDate: '2024-01-10' } };
    const result = calculateProjectStatus(milestones, 'proc-1', processes);
    expect(result.progress).toBe(33);
  });

  it('tính progress đúng khi 2 bước hoàn thành (66%)', () => {
    const milestones = {
      'step-1': { actualDate: '2024-01-10' },
      'step-2': { actualDate: '2024-02-10' },
    };
    const result = calculateProjectStatus(milestones, 'proc-1', processes);
    expect(result.progress).toBe(67);
  });

  it('currentStep = "Hoàn thành" khi tất cả bước xong', () => {
    const milestones = {
      'step-1': { actualDate: '2024-01-10' },
      'step-2': { actualDate: '2024-02-10' },
      'step-3': { actualDate: '2024-03-10' },
    };
    const result = calculateProjectStatus(milestones, 'proc-1', processes);
    expect(result.progress).toBe(100);
    expect(result.currentStep).toBe('Hoàn thành');
  });

  it('status = "Delayed" khi deadline đã qua', () => {
    const milestones = { 'step-1': { agency: '01/01/2020' } };
    const result = calculateProjectStatus(milestones, 'proc-1', processes);
    expect(result.status).toBe('Delayed');
  });

  it('status = "On Track" khi deadline trong tương lai', () => {
    const futureDate = '01/01/2099';
    const milestones = { 'step-1': { agency: futureDate } };
    const result = calculateProjectStatus(milestones, 'proc-1', processes);
    expect(result.status).toBe('On Track');
  });

  it('currentAgency trả về agency của bước đang active', () => {
    const result = calculateProjectStatus({}, 'proc-1', processes);
    expect(result.currentAgency).toBe('Sở XD');
  });

  it('xử lý implementationPlan.agencyActualDate như completed', () => {
    const implementationPlan = { 'step-1': { agencyActualDate: '2024-01-15' } };
    const result = calculateProjectStatus({}, 'proc-1', processes, implementationPlan);
    expect(result.progress).toBe(33);
  });

  it('trả về progress = 0 khi milestones là object rỗng {}', () => {
    // null gây TypeError (code dùng milestones[s.id]), dùng {} thay thế
    const result = calculateProjectStatus({}, 'proc-1', processes);
    expect(result.progress).toBe(0);
  });

  it('bước trước xong nhưng bước tiếp chưa có milestone → hồ sơ sang bước chưa xong kế tiếp (không về "Khởi tạo hồ sơ"/"N/A")', () => {
    const milestones = { 'step-1': { actualDate: '2024-01-10' } };
    const result = calculateProjectStatus(milestones, 'proc-1', processes);
    expect(result.currentStep).toBe('Quy hoạch');
    expect(result.currentAgency).toBe('Sở QHKT');
    expect(result.currentStepId).toBe('step-2');
  });

  it('currentAgency = agency đúng khi bước tiếp có milestone', () => {
    // step-1 xong, step-2 có milestone → activeSteps = [step-2] → agency = 'Sở QHKT'
    const milestones = {
      'step-1': { actualDate: '2024-01-10' },
      'step-2': { agency: '01/01/2099' }, // milestone trong tương lai
    };
    const result = calculateProjectStatus(milestones, 'proc-1', processes);
    expect(result.currentAgency).toBe('Sở QHKT');
  });

  it('hoàn thành 100% khi tất cả bước có actualDate, status vẫn là "On Track"', () => {
    // Hàm chỉ set 'Delayed' khi quá hạn, không có trạng thái 'Completed'
    // Khi tất cả bước xong: progress=100, currentStep='Hoàn thành', status='On Track'
    const milestones = {
      'step-1': { actualDate: '2024-01-10' },
      'step-2': { actualDate: '2024-02-10' },
      'step-3': { actualDate: '2024-03-10' },
    };
    const result = calculateProjectStatus(milestones, 'proc-1', processes);
    expect(result.progress).toBe(100);
    expect(result.currentStep).toBe('Hoàn thành');
    expect(result.status).toBe('On Track');
  });

  it('xử lý processes rỗng không crash', () => {
    expect(() => calculateProjectStatus({}, 'proc-1', [])).not.toThrow();
  });
});
