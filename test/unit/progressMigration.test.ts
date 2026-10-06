// Đợt 3 – chuyển tiến độ ở nơi lưu cũ sang project_progress (server/progressMigration.ts)
import { describe, it, expect } from 'vitest';
import { planProjectMigration, MIGRATION_USER } from '../../server/progressMigration';
import { computeMilestones, milestoneKey } from '../../src/lib/stepProgress';

const PROCESS = {
  id: 'p1', name: 'Quy trình',
  parentSteps: [
    { id: 'ps1', name: 'Chấp thuận chủ trương đầu tư', stage: 'CHUẨN BỊ ĐẦU TƯ', milestoneName: 'Chấp thuận chủ trương', childSteps: [
      { id: 'cs1', name: 'Tiếp nhận hồ sơ', agency: 'Sở Xây dựng' },
      { id: 'cs2', name: 'Trình UBND TP', agency: 'Sở Xây dựng' }
    ] },
    { id: 'ps2', name: 'Quy hoạch 1/500', stage: 'CHUẨN BỊ ĐẦU TƯ', milestoneName: 'QH 1/500', childSteps: [
      { id: 'cs3', name: 'Thẩm định QH', agency: 'Sở Quy hoạch Kiến trúc' }
    ] }
  ]
};
const META = {
  processes: [PROCESS],
  projectStages: [{ name: 'CHUẨN BỊ ĐẦU TƯ', milestones: ['Chấp thuận chủ trương', 'QH 1/500', 'HTKT/ĐTM'] }]
};
const base = { id: '1', code: 'DA-01', name: 'Dự án 1', processId: 'p1', currentStep: 'Thẩm định QH', currentStepId: 'cs3' };
const mOf = (r: any, name: string) => r.milestones.find((m: any) => m.name === name);

describe('planProjectMigration', () => {
  it('MG-01: dự án chỉ có dữ liệu mốc cũ → KH/TT ghi xuống bước, không mất TT, bước hiện tại tính lại', () => {
    const project = { ...base, chutruong_cdt_date: '01/02/2026', chutruong_nn_date: '01/03/2026' };
    const legacy = { chutruong: { cdtDate: '2026-02-05', nnDate: '2026-03-10', nnNote: 'QĐ 123' } };
    const r = planProjectMigration(project, META, legacy, undefined);
    expect(r.after.cs1.cdt).toMatchObject({ planDate: '2026-02-01', actualDate: '2026-02-05', updatedBy: MIGRATION_USER });
    expect(r.after.cs1.nn).toMatchObject({ actualDate: '2026-03-10', status: 'Hoàn thành' });
    expect(r.after.cs2.nn).toMatchObject({ planDate: '2026-03-01', actualDate: '2026-03-10', note: 'QĐ 123' });
    const m = mOf(r, 'Chấp thuận chủ trương');
    expect(m.new).toEqual({ cdtPlan: '2026-02-01', nnPlan: '2026-03-01', cdtActual: '2026-02-05', nnActual: '2026-03-10' });
    // Không còn cần đến nơi lưu cũ: đọc lại chỉ từ bước cho cùng kết quả
    const view = computeMilestones(PROCESS, META.projectStages, r.after)['Chấp thuận chủ trương'];
    expect([view.cdtActual, view.nnActual]).toEqual(['2026-02-05', '2026-03-10']);
    expect(r.newStep).toBe('Thẩm định QH');
    expect(r.stepChanged).toBe(false);
  });

  it('MG-02: bước đã có KH trong JSON → giữ KH theo bước, báo lệch; TT ở bảng cũ vẫn được chuyển', () => {
    const project = {
      ...base, chutruong_nn_date: '15/03/2026',
      milestones: { cs1: { investor: '2026-02-01', agency: '2026-02-20' }, cs2: { agency: '2026-03-01' } }
    };
    const r = planProjectMigration(project, META, { chutruong: { nnDate: '2026-03-02' } }, undefined);
    const m = mOf(r, 'Chấp thuận chủ trương');
    expect(m.new.nnPlan).toBe('2026-03-01');
    expect(m.conflicts.join()).toMatch(/KH CQNN: cột cũ 2026-03-15, bước 2026-03-01/);
    expect(m.new.nnActual).toBe('2026-03-02');
    expect(r.after.cs1.cdt).toMatchObject({ planDate: '2026-02-01', source: 'migration' });
  });

  it('MG-03: mốc không có thủ tục liên kết → lưu thành mốc riêng ms:<tên>', () => {
    const project = { ...base, htkt_dtm_cdt_date: '01/04/2026' };
    const r = planProjectMigration(project, META, { htkt: { nnDate: '2026-04-20', nnNote: 'Đã thỏa thuận' } }, undefined);
    const own = r.after[milestoneKey('HTKT/ĐTM')];
    expect(own.cdt).toMatchObject({ planDate: '2026-04-01' });
    expect(own.nn).toMatchObject({ actualDate: '2026-04-20', note: 'Đã thỏa thuận' });
    expect(mOf(r, 'HTKT/ĐTM')).toMatchObject({ linked: false, new: { nnActual: '2026-04-20' } });
  });

  it('MG-04: "Đã xong" (X) giữ ở cột cũ, không ghi KH xuống bước', () => {
    const project = { ...base, qh1500_cdt_date: 'X', qh1500_nn_date: 'X' };
    const r = planProjectMigration(project, META, {}, undefined);
    expect(r.after.cs3.cdt).toBeUndefined();
    expect(r.after.cs3.nn?.planDate).toBeUndefined();
    expect(mOf(r, 'QH 1/500').new).toMatchObject({ cdtPlan: 'X', nnPlan: 'X' });
  });

  it('MG-05: dòng project_progress đã có thắng dữ liệu cũ; dòng không đổi thì không ghi lại', () => {
    const rows = { cs3: { nn: { actualDate: '2026-05-01', status: 'Hoàn thành', updatedBy: 'Người dùng' } } };
    const r = planProjectMigration(base, META, { qh1500: { nnDate: '2026-04-01' } }, rows);
    expect(mOf(r, 'QH 1/500').conflicts.join()).toMatch(/TT CQNN: bảng cũ 2026-04-01, bước 2026-05-01/);
    expect(r.after.cs3.nn).toEqual(rows.cs3.nn);
    expect(r.rowsToWrite).toBe(0);
  });

  it('MG-06: bước đang lưu không có ngày → ghi "Đang xử lý" vào bước đó, dự án giữ nguyên bước', () => {
    const project = { ...base, currentStep: 'Trình UBND TP', currentStepId: undefined, milestones: { cs3: { agency: '2026-06-01' } } };
    const r = planProjectMigration(project, META, {}, undefined);
    expect(r.after.cs2.nn).toMatchObject({ status: 'Đang xử lý', updatedBy: MIGRATION_USER });
    expect(r.newStep).toBe('Trình UBND TP');
    expect(r.stepChanged).toBe(false);
  });

  it('MG-07: thủ tục của bước đang lưu đã xong theo TT cũ → không ghi trạng thái, dự án sang bước sau', () => {
    const project = { ...base, currentStep: 'Tiếp nhận hồ sơ', currentStepId: 'cs1' };
    const r = planProjectMigration(project, META, { chutruong: { nnDate: '2026-03-10' } }, undefined);
    expect(r.after.cs1.nn).toMatchObject({ actualDate: '2026-03-10' });
    expect(r.storedStepNote).toMatch(/đã xong/);
    expect(r.newStep).toBe('Thẩm định QH');
    expect(r.stepChanged).toBe(true);
  });
});
