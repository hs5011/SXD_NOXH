// @vitest-environment jsdom
/**
 * Component Tests: ProjectGanttDetail (② Sơ đồ Gantt → chi tiết dự án → "+ nhập TT")
 *
 * Từ 05/10/2026: cột = mốc trong danh mục "Cấu hình Giai đoạn & Mốc Milestone" (theo giai đoạn chọn),
 * số liệu = milestones do server tính từ tiến độ theo bước (src/lib/stepProgress.ts); lưu gửi các thay đổi
 * lên server (onSubmitMilestone), server ghi xuống các bước của thủ tục liên kết.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import ProjectGanttDetail from '../../src/components/ProjectGanttDetail';
import type { MilestoneProgress } from '../../src/lib/stepProgress';

vi.mock('../../src/utils/apiFetch', () => ({
  uploadProjectFile: vi.fn(async (_id: string, f: File) => ({ ok: true, doc: { id: 77, name: f.name, size: '1 KB' } })),
  describeUploadFailures: vi.fn(() => ''),
  downloadAttachment: vi.fn(async () => ({ ok: true })),
  isStoredAttachmentId: vi.fn(() => true),
  apiFetch: vi.fn()
}));
vi.mock('../../src/lib/uploadRules', () => ({
  useUploadConfig: () => ({ maxSizeMb: 20, allowedExtensions: ['PDF'] }),
  checkUploadFiles: (files: File[]) => ({ accepted: files, message: '' }),
  uploadExtensionsLabel: () => 'PDF',
  uploadAcceptAttr: () => '.pdf'
}));

const STAGES = [
  { name: 'CHUẨN BỊ ĐẦU TƯ', milestones: ['Chấp thuận chủ trương', 'QH 1/500', 'HTKT/ĐTM'] },
  { name: 'THỰC HIỆN ĐẦU TƯ', milestones: ['Khởi công'] }
];
const PROCESS = {
  id: 'p1',
  parentSteps: [
    { id: 'ps1', name: 'Thủ tục chủ trương', milestoneName: 'Chấp thuận chủ trương', childSteps: [] },
    { id: 'ps2', name: 'Thủ tục quy hoạch 1/500', milestoneName: 'QH 1/500', childSteps: [] }
  ]
};
const AGENCIES = [
  { id: '1', name: 'Sở Xây dựng' }, { id: '2', name: 'Sở Quy hoạch Kiến trúc' }, { id: '3', name: 'Sở NNMT' }
];

const mp = (name: string, stage: string, extra: Partial<MilestoneProgress> = {}): MilestoneProgress => ({
  name, stage, linked: true, procedureIds: [], stepIds: [],
  cdtPlan: '', nnPlan: '', cdtActual: '', nnActual: '', cdtNote: '', nnNote: '',
  cdtAttachments: [], nnAttachments: [], agency: '', currentStepId: '', anchorCdtStepId: '', ...extra
});

const MILESTONES: Record<string, MilestoneProgress> = {
  'Chấp thuận chủ trương': mp('Chấp thuận chủ trương', 'CHUẨN BỊ ĐẦU TƯ', {
    procedureIds: ['ps1'], stepIds: ['cs1', 'cs2'], cdtPlan: '2026-02-01', nnPlan: '2026-04-01',
    cdtActual: '2026-02-02', nnActual: '2026-03-20', nnNote: 'QĐ số 1', agency: 'UBND TP'
  }),
  'QH 1/500': mp('QH 1/500', 'CHUẨN BỊ ĐẦU TƯ', {
    procedureIds: ['ps2'], stepIds: ['cs4', 'cs5'], cdtPlan: '2026-05-01', nnPlan: '2026-06-01',
    agency: 'Sở Quy hoạch Kiến trúc', currentStepId: 'cs4'
  }),
  'HTKT/ĐTM': mp('HTKT/ĐTM', 'CHUẨN BỊ ĐẦU TƯ', { linked: false }),
  'Khởi công': mp('Khởi công', 'THỰC HIỆN ĐẦU TƯ', { linked: false })
};

const project = {
  id: 'p-1', code: 'NOXH-01', name: 'Nhà Ở Xã Hội Bình Tân', investor: 'Công ty A', location: 'Phường Bình Đông',
  apartmentCount: 200, height: 10, processId: 'p1', currentStepId: 'cs4', currentStep: 'Thẩm định QH', startDate: '01/01/2026', endDate: '31/12/2028'
};
const ADMIN = { roleId: 'Admin', userType: 'agency', agencyId: '1' };
const INVESTOR = { roleId: 'Lãnh đạo', userType: 'investor', investorId: 'Công ty A' };
const SQHKT = { roleId: 'Lãnh đạo', userType: 'agency', agencyId: '2' };
const SNNMT = { roleId: 'Lãnh đạo', userType: 'agency', agencyId: '3' };

function renderDetail(overrides: Record<string, any> = {}) {
  const props = {
    project, onBack: vi.fn(), milestones: MILESTONES, projectStages: STAGES, processes: [PROCESS],
    processingAgencies: AGENCIES, onSubmitMilestone: vi.fn(async () => true), ...overrides
  };
  return { props, ...render(<ProjectGanttDetail {...props} />) };
}

describe('ProjectGanttDetail – hiển thị', () => {
  it('tên dự án, chủ đầu tư, bước hiện tại, legend', () => {
    renderDetail();
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.getByText('Công ty A')).toBeInTheDocument();
    expect(screen.getByText('Thẩm định QH')).toBeInTheDocument();
    ['Hoàn thành', 'Đang thực hiện', 'Đúng hạn', 'Quá hạn', 'Chưa bắt đầu'].forEach(l => expect(screen.getAllByText(l).length).toBeGreaterThan(0));
  });
  it('nút quay lại gọi onBack', () => {
    const { props } = renderDetail();
    fireEvent.click(screen.getByTitle('Quay lại'));
    expect(props.onBack).toHaveBeenCalled();
  });
  it('cột = mốc của giai đoạn đang ở (mặc định), lấy từ danh mục', () => {
    renderDetail();
    expect(screen.getByRole('combobox', { name: 'Giai đoạn' })).toHaveValue('CHUẨN BỊ ĐẦU TƯ');
    ['Chấp thuận chủ trương', 'QH 1/500', 'HTKT/ĐTM'].forEach(n => expect(screen.getAllByText(n).length).toBeGreaterThan(0));
    expect(screen.queryByText('Khởi công')).not.toBeInTheDocument();
  });
  it('đổi giai đoạn ở combobox → chỉ hiện mốc của giai đoạn đó', () => {
    renderDetail();
    fireEvent.change(screen.getByRole('combobox', { name: 'Giai đoạn' }), { target: { value: 'THỰC HIỆN ĐẦU TƯ' } });
    expect(screen.getByText('Khởi công')).toBeInTheDocument();
    expect(screen.queryByText('QH 1/500')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Giai đoạn' }), { target: { value: 'Tất cả giai đoạn' } });
    expect(screen.getByText('Khởi công')).toBeInTheDocument();
    expect(screen.getByText('QH 1/500')).toBeInTheDocument();
  });
  it('ngày KH / TT lấy từ milestones; dòng cơ quan theo cơ quan đang giữ / đã hoàn thành mốc', () => {
    renderDetail();
    expect(screen.getByText('02/02/2026')).toBeInTheDocument();
    expect(screen.getByText('20/03/2026')).toBeInTheDocument();
    expect(screen.getByText('UBND TP')).toBeInTheDocument();
    expect(screen.getByText('Sở Quy hoạch Kiến trúc')).toBeInTheDocument();
  });
  it('mốc chưa liên kết thủ tục ghi "(mốc riêng)"', () => {
    renderDetail();
    expect(screen.getAllByText('(mốc riêng)').length).toBe(1);
  });
  it('đếm TT đã hoàn thành trên mọi mốc của danh mục', () => {
    renderDetail();
    expect(screen.getByText('1/4')).toBeInTheDocument();
  });
  it('giai đoạn không có mốc → thông báo', () => {
    renderDetail({ projectStages: [{ name: 'CHUẨN BỊ ĐẦU TƯ', milestones: [] }], milestones: {} });
    expect(screen.getByText(/chưa có mốc tiến độ nào/i)).toBeInTheDocument();
  });
});

describe('ProjectGanttDetail – quyền nhập', () => {
  it('không có tài khoản → không có "+ nhập TT"', () => {
    renderDetail();
    expect(screen.queryByText('+ nhập TT')).not.toBeInTheDocument();
  });
  it('Admin / SXD thấy "+ nhập TT"', () => {
    renderDetail({ currentUser: ADMIN });
    expect(screen.getAllByText('+ nhập TT').length).toBeGreaterThan(0);
  });
  it('chủ đầu tư của dự án chỉ có "+ nhập TT" ở dòng CĐT', () => {
    renderDetail({ currentUser: INVESTOR });
    // QH 1/500 (CĐT) — các dòng cơ quan không có nút
    expect(screen.getAllByText('+ nhập TT').length).toBe(1);
  });
  it('cơ quan đang giữ bước của mốc (SQHKT) có nút ở mốc QH 1/500', () => {
    renderDetail({ currentUser: SQHKT });
    expect(screen.getAllByText('+ nhập TT').length).toBe(1);
  });
  it('cơ quan khác (SNNMT) không có nút', () => {
    renderDetail({ currentUser: SNNMT });
    expect(screen.queryByText('+ nhập TT')).not.toBeInTheDocument();
  });
});

describe('ProjectGanttDetail – modal nhập tiến độ', () => {
  const open = () => fireEvent.click(screen.getAllByText('+ nhập TT')[0]);

  it('mở modal: tên mốc, thủ tục liên kết, cơ quan đang xử lý', () => {
    renderDetail({ currentUser: ADMIN });
    open();
    expect(screen.getByText('Nhập tiến độ thực hiện')).toBeInTheDocument();
    expect(screen.getByText('Mốc: QH 1/500')).toBeInTheDocument();
    expect(screen.getByText(/Thủ tục quy hoạch 1\/500/)).toBeInTheDocument();
  });
  it('Hủy / X đóng modal', () => {
    renderDetail({ currentUser: ADMIN });
    open();
    fireEvent.click(screen.getByText('Hủy'));
    expect(screen.queryByText('Nhập tiến độ thực hiện')).not.toBeInTheDocument();
    open();
    fireEvent.click(screen.getByTitle('Đóng'));
    expect(screen.queryByText('Nhập tiến độ thực hiện')).not.toBeInTheDocument();
  });
  it('"Lấy ngày KH" + Lưu → gửi thay đổi CĐT và CQNN của mốc', async () => {
    const { props } = renderDetail({ currentUser: ADMIN });
    open();
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByText('Lưu tiến độ'));
    await waitFor(() => expect(props.onSubmitMilestone).toHaveBeenCalled());
    const [pid, changes] = (props.onSubmitMilestone as any).mock.calls[0];
    expect(pid).toBe('p-1');
    expect(changes).toEqual([
      expect.objectContaining({ milestone: 'QH 1/500', side: 'cdt', date: '2026-05-01' }),
      expect.objectContaining({ milestone: 'QH 1/500', side: 'nn', date: '2026-06-01' })
    ]);
    await waitFor(() => expect(screen.queryByText('Nhập tiến độ thực hiện')).not.toBeInTheDocument());
  });
  it('chủ đầu tư: chỉ gửi phía CĐT; phía cơ quan chỉ xem', async () => {
    const { props } = renderDetail({ currentUser: INVESTOR });
    open();
    expect(screen.getByText('Chỉ xem')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByText('Lưu tiến độ'));
    await waitFor(() => expect(props.onSubmitMilestone).toHaveBeenCalled());
    const changes = (props.onSubmitMilestone as any).mock.calls[0][1];
    expect(changes.map((c: any) => c.side)).toEqual(['cdt']);
  });
  it('không thay đổi gì → không gửi', async () => {
    const { props } = renderDetail({ currentUser: ADMIN });
    open();
    fireEvent.click(screen.getByText('Lưu tiến độ'));
    await waitFor(() => expect(screen.queryByText('Nhập tiến độ thực hiện')).not.toBeInTheDocument());
    expect(props.onSubmitMilestone).not.toHaveBeenCalled();
  });
  it('server từ chối → hiện lỗi, modal vẫn mở', async () => {
    renderDetail({ currentUser: ADMIN, onSubmitMilestone: vi.fn(async () => { throw new Error('Ngày thực tế không được sau ngày hôm nay.'); }) });
    open();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByText('Lưu tiến độ'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ngày thực tế không được sau ngày hôm nay.');
    expect(screen.getByText('Nhập tiến độ thực hiện')).toBeInTheDocument();
  });
  it('bấm vào ô TT đã có mở modal với ghi chú đã lưu', () => {
    renderDetail({ currentUser: ADMIN });
    fireEvent.click(screen.getByText('20/03/2026'));
    expect(screen.getByText('Mốc: Chấp thuận chủ trương')).toBeInTheDocument();
    expect(screen.getByDisplayValue('QĐ số 1')).toBeInTheDocument();
  });
});
