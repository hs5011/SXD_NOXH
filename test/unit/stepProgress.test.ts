/**
 * Quy tắc đồng bộ tiến độ theo bước (①) ↔ theo mốc (②) — src/lib/stepProgress.ts
 * Quy trình thử: giống p1 trên DB thật (thủ tục QH 1/500 có 2 nhánh loại trừ nhau).
 */
import { describe, it, expect } from 'vitest';
import {
  applyMilestoneInput, applyMilestonePlan, applyStepUpdate, catalogMilestones, computeMilestone,
  computeMilestones, procedureState, skippedStepIds, legacyStepViews, activeMilestoneIndex,
  milestoneSideStatus, milestoneKey, toIsoDate, legacyPhaseOf
} from '../../src/lib/stepProgress';
import { isStepCompleted } from '../../src/lib/stepAgency';

const stages = [
  { name: 'CHUẨN BỊ ĐẦU TƯ', milestones: ['Chấp thuận chủ trương', 'QH 1/500', 'HTKT/ĐTM'] },
  { name: 'THỰC HIỆN ĐẦU TƯ', milestones: [] }
];
const process = {
  id: 'p1',
  parentSteps: [
    { id: 'ps1', name: 'Chấp thuận chủ trương đầu tư', stage: 'CHUẨN BỊ ĐẦU TƯ', milestoneName: 'Chấp thuận chủ trương', childSteps: [
      { id: 'cs1', name: 'Công bố thông tin', agency: 'Sở Xây dựng', slaDays: 30 },
      { id: 'cs3', name: 'Thẩm định chủ trương', agency: 'Sở Xây dựng', slaDays: 7 },
      { id: 'cs2', name: 'Chấp thuận chủ trương', agency: 'UBND TP', slaDays: 3 }
    ] },
    { id: 'ps2', name: 'QH 1/500', stage: 'CHUẨN BỊ ĐẦU TƯ', milestoneName: 'qh  1/500 ', childSteps: [
      { id: 'cs4', name: 'Thẩm định QH (02 đơn vị)', agency: 'Sở Quy hoạch Kiến trúc', slaDays: 15 },
      { id: 'cs5', name: 'Chấp thuận (02 đơn vị)', agency: 'UBND TP', slaDays: 7 },
      { id: 'cs41', name: 'Thẩm định QH (01 đơn vị)', agency: 'UBND cấp xã, phường', slaDays: 15 },
      { id: 'cs51', name: 'Chấp thuận (01 đơn vị)', agency: 'UBND cấp xã, phường', slaDays: 7 }
    ] },
    { id: 'ps5', name: 'Phê duyệt giá bán', stage: 'THỰC HIỆN ĐẦU TƯ', childSteps: [
      { id: 'cs9', name: 'Phê duyệt giá bán', agency: 'Chủ đầu tư', slaDays: 40 }
    ] }
  ]
};
const close = (p: any, stepId: string, date: string, next: string[] = []) =>
  applyStepUpdate(process, p, { stepId, side: 'nn', status: 'Hoàn thành', date, nextStepIds: next });

describe('Danh mục mốc', () => {
  it('lấy theo giai đoạn, giữ thứ tự cấu hình', () => {
    expect(catalogMilestones(stages).map(m => m.name)).toEqual(['Chấp thuận chủ trương', 'QH 1/500', 'HTKT/ĐTM']);
    expect(catalogMilestones(stages, 'THỰC HIỆN ĐẦU TƯ')).toEqual([]);
  });
  it('liên kết thủ tục ↔ mốc không phân biệt hoa thường / khoảng trắng', () => {
    const m = computeMilestone(process, { name: 'QH 1/500', stage: '', order: 1 }, {});
    expect(m.linked).toBe(true);
    expect(m.stepIds).toEqual(['cs4', 'cs5', 'cs41', 'cs51']);
  });
});

describe('① → ②: mốc tính từ các bước', () => {
  it('đóng bước có chọn bước tiếp theo nằm ngoài thủ tục → mốc xong, nhánh còn lại "không áp dụng"', () => {
    let p = close({}, 'cs4', '2026-05-10', ['cs5']);
    expect(procedureState(process.parentSteps[1], p).done).toBe(false);
    p = close(p, 'cs5', '2026-05-20', ['cs9']);
    const st = procedureState(process.parentSteps[1], p);
    expect(st.done).toBe(true);
    expect(st.doneDate).toBe('2026-05-20');
    expect([...skippedStepIds(process, p)]).toEqual(['cs41', 'cs51']);
    const views = legacyStepViews(process, p);
    expect(isStepCompleted('cs41', views.milestones, views.implementationPlan)).toBe(true);
    expect(computeMilestones(process, stages, p)['QH 1/500'].nnActual).toBe('2026-05-20');
  });
  it('đóng bước nhưng bước tiếp theo vẫn trong thủ tục → mốc chưa xong; đóng bước cuối → xong', () => {
    let p = close({}, 'cs1', '2026-03-01', ['cs3']);
    p = close(p, 'cs3', '2026-03-10', ['cs2']);
    expect(computeMilestones(process, stages, p)['Chấp thuận chủ trương'].nnActual).toBe('');
    p = close(p, 'cs2', '2026-03-15');
    expect(computeMilestones(process, stages, p)['Chấp thuận chủ trương'].nnActual).toBe('2026-03-15');
  });
  it('CĐT: ngày nộp = ngày sớm nhất các bước; KH CĐT = HXL CĐT bước đầu; KH CQNN = HXL CQNN muộn nhất', () => {
    let p: any = { cs1: { cdt: { planDate: '2026-02-01' }, nn: { planDate: '2026-02-20' } }, cs2: { nn: { planDate: '2026-04-01' } } };
    p = applyStepUpdate(process, p, { stepId: 'cs3', side: 'cdt', date: '05/03/2026' });
    p = applyStepUpdate(process, p, { stepId: 'cs1', side: 'cdt', date: '2026-02-02' });
    const m = computeMilestones(process, stages, p)['Chấp thuận chủ trương'];
    expect(m.cdtActual).toBe('2026-02-02');
    expect(m.cdtPlan).toBe('2026-02-01');
    expect(m.nnPlan).toBe('2026-04-01');
  });
  it('trạng thái trung gian không đóng bước; ngày là ngày dự kiến', () => {
    const p = applyStepUpdate(process, {}, { stepId: 'cs1', side: 'nn', status: 'Chờ bổ sung hồ sơ', date: '2026-10-15' });
    expect(p.cs1.nn).toMatchObject({ status: 'Chờ bổ sung hồ sơ', expectedDate: '2026-10-15' });
    expect(p.cs1.nn!.actualDate).toBeUndefined();
  });
  it('nhập TT CĐT không làm bước "xong"', () => {
    const p = applyStepUpdate(process, {}, { stepId: 'cs1', side: 'cdt', date: '2026-02-01' });
    const v = legacyStepViews(process, p);
    expect(isStepCompleted('cs1', v.milestones, v.implementationPlan)).toBe(false);
  });
  it('đóng bước: HXL CQNN bước tiếp theo = ngày đóng + số ngày xử lý', () => {
    const p = close({}, 'cs1', '2026-03-01', ['cs3']);
    expect(p.cs3.nn!.planDate).toBe('2026-03-08');
  });
});

describe('② → ①: nhập nhanh theo mốc', () => {
  it('CQNN: đóng mọi bước còn mở của thủ tục cùng ngày', () => {
    let p = close({}, 'cs1', '2026-03-01', ['cs3']);
    p = applyMilestoneInput(process, p, { milestone: 'Chấp thuận chủ trương', side: 'nn', date: '20/03/2026', note: 'QĐ 123' });
    expect(p.cs1.nn!.actualDate).toBe('2026-03-01');
    expect(p.cs3.nn).toMatchObject({ actualDate: '2026-03-20', status: 'Hoàn thành', source: 'milestone' });
    expect(p.cs2.nn).toMatchObject({ actualDate: '2026-03-20', note: 'QĐ 123' });
    const m = computeMilestones(process, stages, p)['Chấp thuận chủ trương'];
    expect(m.nnActual).toBe('2026-03-20');
    expect(m.nnNote).toBe('QĐ 123');
  });
  it('CĐT: ghi vào bước đầu của thủ tục', () => {
    const p = applyMilestoneInput(process, {}, { milestone: 'QH 1/500', side: 'cdt', date: '2026-04-01' });
    expect(p.cs4.cdt!.actualDate).toBe('2026-04-01');
  });
  it('mốc đã xong: nhập lại ngày CQNN sửa ngày của bước kết thúc thủ tục', () => {
    let p = close({}, 'cs4', '2026-05-10', ['cs5']);
    p = close(p, 'cs5', '2026-05-20', ['cs9']);
    p = applyMilestoneInput(process, p, { milestone: 'QH 1/500', side: 'nn', date: '2026-05-25' });
    expect(p.cs5.nn!.actualDate).toBe('2026-05-25');
    expect(p.cs41?.nn?.actualDate).toBeUndefined();
  });
  it('xóa ngày CQNN của mốc chỉ bỏ những bước do nhập nhanh đóng', () => {
    let p = close({}, 'cs1', '2026-03-01', ['cs3']);
    p = applyMilestoneInput(process, p, { milestone: 'Chấp thuận chủ trương', side: 'nn', date: '2026-03-20' });
    p = applyMilestoneInput(process, p, { milestone: 'Chấp thuận chủ trương', side: 'nn', date: '' });
    expect(p.cs1.nn!.actualDate).toBe('2026-03-01');
    expect(p.cs3.nn!.actualDate).toBeUndefined();
    expect(p.cs2.nn!.actualDate).toBeUndefined();
  });
  it('mốc không có thủ tục liên kết (6b): lưu riêng theo mốc', () => {
    const p = applyMilestoneInput(process, {}, { milestone: 'HTKT/ĐTM', side: 'nn', date: '2026-06-01', note: 'x' });
    expect(p[milestoneKey('HTKT/ĐTM')].nn!.actualDate).toBe('2026-06-01');
    const m = computeMilestones(process, stages, p)['HTKT/ĐTM'];
    expect(m.linked).toBe(false);
    expect(m.nnActual).toBe('2026-06-01');
  });
});

describe('Kế hoạch theo mốc (Chỉnh sửa mốc)', () => {
  it('CĐT → bước đầu; CQNN → bước có HXL CQNN muộn nhất (không có thì bước cuối)', () => {
    let p = applyMilestonePlan(process, {}, 'Chấp thuận chủ trương', 'cdt', '01/02/2026');
    p = applyMilestonePlan(process, p, 'Chấp thuận chủ trương', 'nn', '01/04/2026');
    expect(p.cs1.cdt!.planDate).toBe('2026-02-01');
    expect(p.cs2.nn!.planDate).toBe('2026-04-01');
    p = applyMilestonePlan(process, p, 'Chấp thuận chủ trương', 'nn', '10/04/2026');
    expect(p.cs2.nn!.planDate).toBe('2026-04-10');
    const m = computeMilestones(process, stages, p)['Chấp thuận chủ trương'];
    expect([m.cdtPlan, m.nnPlan]).toEqual(['2026-02-01', '2026-04-10']);
  });
});

describe('Dữ liệu cũ và trạng thái trên Gantt', () => {
  it('mốc chưa có dữ liệu bước dùng giá trị cũ (cột *_date / bảng tiến độ cũ)', () => {
    const m = computeMilestone(process, { name: 'Chấp thuận chủ trương', stage: '', order: 0 }, {}, {
      cdtPlan: '25/05/2026', nnPlan: 'X', cdtActual: '2026-05-20', nnActual: ''
    });
    expect([m.cdtPlan, m.nnPlan, m.cdtActual]).toEqual(['2026-05-25', 'X', '2026-05-20']);
  });
  it('nhận diện mốc cũ theo tên (cầu nối dữ liệu cũ)', () => {
    expect(legacyPhaseOf('QH 1/500')?.id).toBe('qh1500');
    expect(legacyPhaseOf('Quyết định giao đất / thuê đất')?.id).toBe('giaodat');
    expect(legacyPhaseOf('HTKT/ĐTM')?.id).toBe('htkt');
    expect(legacyPhaseOf('GPXD')?.id).toBe('gpxd');
    expect(legacyPhaseOf('Khởi công')).toBeUndefined();
  });
  it('mốc đang thực hiện: theo bước hiện tại; trạng thái trễ khi qua HXL', () => {
    const list = Object.values(computeMilestones(process, stages, close({}, 'cs2', '2026-03-15')));
    const idx = activeMilestoneIndex(list, 'cs4');
    expect(idx).toBe(1);
    const qh = { ...list[1], nnPlan: '2026-01-01' };
    expect(milestoneSideStatus(qh, 'nn', 1, idx, new Date('2026-10-05'))).toBe('delayed');
    expect(milestoneSideStatus(list[0], 'nn', 0, idx)).toBe('done');
    expect(milestoneSideStatus(list[2], 'nn', 2, idx)).toBe('not_started');
  });
  it('toIsoDate', () => {
    expect(toIsoDate('5/3/26')).toBe('2026-03-05');
    expect(toIsoDate('31/02/2026')).toBe('');
  });
});
